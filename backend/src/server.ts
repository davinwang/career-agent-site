import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { initDb, closeDb, get, all } from './db/client.js';
import { getMastra } from './mastra/index.js';
import { authRoutes, authRequired, verifyToken, type AppEnv } from './api/auth.js';
import { resumeRoutes } from './api/resume.js';
import { sessionRoutes } from './api/sessions.js';
import { uploadRoutes } from './api/upload.js';
import { skillRoutes } from './api/skills.js';
import { knowledgeRoutes } from './api/knowledge.js';
import { projectRoutes } from './api/projects.js';
import { settingsRoutes } from './api/settings.js';
import { checkInput } from './guardrails/input.js';
import { redactSourceDumps } from './guardrails/output.js';
import { ensureSession, persistMessages, getRecentMessages } from './services/session.js';
import { loadSkillsPrompt } from './prompts/skills.js';
import { RECRUITER_SYSTEM_PROMPT, ADMIN_SYSTEM_PROMPT } from './prompts/system.js';

const app = new Hono<AppEnv>();

// --- Global middleware -------------------------------------------------------
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.frontendOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Centralized error handling: never leak stack traces to clients.
app.onError((err, c) => {
  console.error('[server] unhandled error:', err);
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  return c.json({ error: config.env === 'production' ? 'Internal Server Error' : err.message }, status as 500);
});

// --- Health ------------------------------------------------------------------
app.get('/api/health', (c) => c.json({ ok: true, service: 'job-agent-backend', env: config.env }));

// --- REST API ----------------------------------------------------------------
app.route('/api/auth', authRoutes);
app.route('/api/resume', resumeRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/skills', skillRoutes);
app.route('/api/knowledge', knowledgeRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/settings', settingsRoutes);

// --- Artifacts: everything produced through conversation ----------------------
// One aggregated view for the chat-page nine-grid: resume languages + photo,
// knowledge files, projects, skills. All read-only; writes happen via the
// admin agent's tools during conversation.
app.get('/api/artifacts', authRequired, async (c) => {
  const [langs, know, proj, skills, uploads] = await Promise.all([
    all<{ lang: string }>('SELECT lang FROM resume'),
    all<{ id: string; filename: string; source_type: string; created_at: string; metadata: string | null; excerpt: string }>(
      "SELECT id, filename, source_type, created_at, metadata, substr(content, 1, 300) AS excerpt FROM knowledge ORDER BY created_at DESC",
    ),
    all<{ id: string; name: string; repo_url: string | null; status: string; created_at: string; has_doc: number }>(
      `SELECT p.id, p.name, p.repo_url, p.status, p.created_at,
              CASE WHEN p.doc IS NULL OR p.doc = '' THEN 0 ELSE 1 END AS has_doc
       FROM projects p ORDER BY p.created_at DESC`,
    ),
    all<{ id: string; name: string; prompt: string; enabled: number; priority: number }>(
      'SELECT id, name, prompt, enabled, priority FROM skills ORDER BY priority DESC, created_at ASC',
    ),
    all<{ id: string; stored_name: string; original_name: string; ext: string; size: number; created_at: string }>(
      'SELECT id, stored_name, original_name, ext, size, created_at FROM uploads ORDER BY created_at DESC',
    ),
  ]);

  // Pull photo + name from each language's resume blob (if present).
  const resumeMeta = await Promise.all(
    langs.map(async (row) => {
      try {
        const full = await get<{ data: string }>('SELECT data FROM resume WHERE lang = ?', [row.lang]);
        const parsed = full ? (JSON.parse(full.data) as Record<string, unknown>) : {};
        return {
          lang: row.lang,
          name: typeof parsed.name === 'string' ? parsed.name : null,
          photo: typeof parsed.photo === 'string' ? parsed.photo : null,
          updated_at: null,
        };
      } catch {
        return { lang: row.lang, name: null, photo: null, updated_at: null };
      }
    }),
  );

  return c.json({
    resumes: resumeMeta,
    knowledge: know,
    projects: proj,
    skills: skills.map((s) => ({ ...s, enabled: !!s.enabled })),
    uploads,
  });
});

// --- Static upload serving ---------------------------------------------------
// Images are PUBLIC (the recruiter-facing resume shows photo/company logos);
// every other upload stays admin-only (authRequired).
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

app.get('/uploads/:name', async (c) => {
  // basename() neutralizes any path-traversal attempts in the param.
  const safeName = path.basename(c.req.param('name'));
  const ext = path.extname(safeName).toLowerCase();
  const mime = IMAGE_MIME[ext];

  // Non-image uploads require admin auth.
  if (!mime) {
    const username = verifyToken(c.req.header('Authorization'));
    if (!username) {
      return c.json({ error: 'unauthorized' }, 401);
    }
  }

  const filePath = path.join(config.uploadDir, safeName);
  try {
    const data = await fs.readFile(filePath);
    // Copy into a standalone buffer: Node may hand back a view into a shared
    // memory pool, so `data.buffer` could expose unrelated bytes.
    const bytes = new Uint8Array(data);
    return c.body(bytes.buffer as ArrayBuffer, 200, {
      'Content-Type': mime ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': mime ? 'public, max-age=86400' : 'no-store',
    });
  } catch {
    return c.json({ error: 'file not found' }, 404);
  }
});

// --- AG-UI SSE Streaming Endpoints -------------------------------------------

/**
 * Get block message for guardrail violations.
 */
function getBlockMessage(violation: string): string {
  switch (violation) {
    case 'source_code_exfiltration':
      return '抱歉，为保护候选人的知识产权，我无法提供项目源代码、配置文件或内部文档的原始内容。如果您对技术实现感兴趣，我很乐意以技术方案的形式为您讲解架构思路和技术亮点，也建议安排技术面试深入了解。';
    case 'prompt_injection':
      return '抱歉，我只能作为候选人的AI助手回答与招聘相关的问题。如果您想了解候选人的工作经历、项目经验或技术能力，请随时提问。';
    case 'defamation':
      return '抱歉，我无法对候选人进行负面评价或编造不实信息。我的职责是客观、准确地介绍候选人的经历和能力。如果您有具体的技术或经历方面的疑问，我很乐意回答。';
    case 'privacy_fishing':
      return '抱歉，候选人的身份证号、家庭住址、家属信息、详细薪资流水等属于个人隐私信息，我无法提供。如果您需要了解候选人的期望薪资范围或工作地点偏好，我可以为您查询简历中公开的信息。';
    default:
      return '抱歉，该请求超出了我的服务范围。我可以帮助您了解候选人的工作经历、项目经验、技术栈和求职意向。请换个问题试试。';
  }
}

/**
 * POST /ag-ui/recruiter — Recruiter-facing AG-UI SSE endpoint.
 *
 * Applies input guardrail → runs agent → applies output guardrail → streams via SSE.
 * No authentication required (public-facing).
 */
app.post('/ag-ui/recruiter', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, threadId } = body;
  const sessionId = threadId || uuidv4();

  // Extract the last user message
  const lastUserMsg = messages?.filter((m: any) => m.role === 'user').pop();
  if (!lastUserMsg?.content) {
    return c.json({ error: 'No user message found' }, 400);
  }

  const userMessage = lastUserMsg.content;

  // Ensure session exists
  await ensureSession(sessionId, 'recruiter');

  // Apply input guardrail
  const inputCheck = await checkInput(userMessage);
  if (!inputCheck.safe) {
    const blockMsg = getBlockMessage(inputCheck.violation!);
    // Persist the exchange
    await persistMessages(sessionId, 'recruiter', userMessage, blockMsg);

    // Return block message as SSE
    return streamSSE(c, async (stream) => {
      const messageId = uuidv4();
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: blockMsg }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_FINISHED', threadId: sessionId }), event: 'message' });
    });
  }

  // Load history for context
  const history = await getRecentMessages(sessionId, 20);

  // Compose instructions with skills
  const skillsPrompt = await loadSkillsPrompt();
  // Anti-hallucination guard: when no resume/knowledge has been published, the
  // model tends to invent plausible-sounding candidate details. Inject an
  // explicit empty-dossier directive so it declines honestly instead.
  const [resumeCount, knowledgeCount] = await Promise.all([
    get<{ c: number }>('SELECT COUNT(*) AS c FROM resume'),
    get<{ c: number }>('SELECT COUNT(*) AS c FROM knowledge'),
  ]);
  const emptyDossierPrompt =
    (resumeCount?.c ?? 0) === 0 && (knowledgeCount?.c ?? 0) === 0
      ? `\n\n## ⚠️ 档案为空（重要）\n当前系统中没有任何已发布的简历或知识库材料。你**没有**关于候选人的任何真实信息——绝对禁止编造工作经历、项目、技术栈、量化成果等内容。对于询问候选人经历的问题，如实回答："该候选人的档案尚未发布，暂时无法提供具体信息，请稍后再来查看。"不要猜测、不要示意你有隐藏的简历内容。`
      : '';
  const instructions = `${RECRUITER_SYSTEM_PROMPT}${skillsPrompt}${emptyDossierPrompt}`;

  // Build messages array for the agent
  const agentMessages = [
    { role: 'system' as const, content: instructions },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  // Call the LLM directly for streaming
  const { llm } = config;

  return streamSSE(c, async (stream) => {
    const messageId = uuidv4();
    let fullResponse = '';

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId }), event: 'message' });

      const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
          model: llm.model,
          messages: agentMessages,
          temperature: 0.7,
          max_tokens: 2000,
          stream: true,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      // Process SSE stream from LLM
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                await stream.writeSSE({
                  data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta }),
                  event: 'message',
                });
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }

      // Apply output guardrail to the full response
      const redactedResponse = redactSourceDumps(fullResponse);

      // If redaction changed the response, send a correction event
      if (redactedResponse !== fullResponse) {
        // Send the redacted version as a replacement
        await stream.writeSSE({
          data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: '', redacted: true, fullContent: redactedResponse }),
          event: 'message',
        });
        fullResponse = redactedResponse;
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_FINISHED', threadId: sessionId }), event: 'message' });

      // Persist messages
      await persistMessages(sessionId, 'recruiter', userMessage, fullResponse);
    } catch (err: any) {
      console.error('[ag-ui/recruiter] Error:', err);
      const errorMsg = '抱歉，处理您的请求时出现了问题。请稍后重试。';
      await stream.writeSSE({
        data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: errorMsg }),
        event: 'message',
      });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_FINISHED', threadId: sessionId }), event: 'message' });
      await persistMessages(sessionId, 'recruiter', userMessage, errorMsg);
    }
  });
});

/**
 * POST /ag-ui/admin — Admin-facing AG-UI SSE endpoint.
 * Requires JWT authentication.
 */
app.post('/ag-ui/admin', async (c) => {
  // Verify JWT
  const username = verifyToken(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, threadId } = body;
  const sessionId = threadId || uuidv4();

  // Extract the last user message
  const lastUserMsg = messages?.filter((m: any) => m.role === 'user').pop();
  if (!lastUserMsg?.content) {
    return c.json({ error: 'No user message found' }, 400);
  }

  const userMessage = lastUserMsg.content;

  // Ensure session exists
  await ensureSession(sessionId, 'admin');

  // Load history for context
  const history = await getRecentMessages(sessionId, 20);

  // Build messages array for the agent
  const agentMessages = [
    { role: 'system' as const, content: ADMIN_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  // Call the LLM directly for streaming
  const { llm } = config;

  return streamSSE(c, async (stream) => {
    const messageId = uuidv4();
    let fullResponse = '';

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId }), event: 'message' });

      const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
          model: llm.model,
          messages: agentMessages,
          temperature: 0.7,
          max_tokens: 4000,
          stream: true,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      // Process SSE stream from LLM
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                await stream.writeSSE({
                  data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta }),
                  event: 'message',
                });
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_FINISHED', threadId: sessionId }), event: 'message' });

      // Persist messages
      await persistMessages(sessionId, 'admin', userMessage, fullResponse);
    } catch (err: any) {
      console.error('[ag-ui/admin] Error:', err);
      const errorMsg = '处理请求时出现了问题，请稍后重试。';
      await stream.writeSSE({
        data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: errorMsg }),
        event: 'message',
      });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_FINISHED', threadId: sessionId }), event: 'message' });
      await persistMessages(sessionId, 'admin', userMessage, errorMsg);
    }
  });
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// --- Bootstrap & graceful shutdown -------------------------------------------
async function main(): Promise<void> {
  await initDb();
  console.log('[server] database initialized');

  // Warm up the Mastra instance (agents + storage) in the background; a failure
  // here must not block the REST API from serving.
  getMastra()
    .then(() => console.log('[server] mastra agents ready'))
    .catch((err) => console.warn('[server] mastra init deferred:', err));

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await closeDb();
      console.log('[server] closed');
      process.exit(0);
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
