import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Context } from 'hono';
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
import { ensureSession } from './services/session.js';
import { runAgentTurn } from './services/chat.js';

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
 * Shared AG-UI SSE handler: translates the Mastra bridge event stream into
 * the frontend event subset and forwards it over SSE. Runs the full agent
 * tool-calling loop via @ag-ui/mastra (tools, memory, multi-step).
 */
async function handleAgUi(
  c: Context,
  opts: { kind: 'admin' | 'recruiter'; resourceId: string },
) {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, threadId } = body as {
    messages?: Array<{ role: string; content: string }>;
    threadId?: string;
  };
  const sessionId = threadId || uuidv4();

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'No messages found' }, 400);
  }

  const history = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  await ensureSession(sessionId, opts.kind);

  return streamSSE(c, async (stream) => {
    try {
      const events = await runAgentTurn({
        kind: opts.kind,
        sessionId,
        resourceId: opts.resourceId,
        messages: history,
        signal: c.req.raw.signal,
      });

      // Forward translated events; abort the agent when the client goes away.
      const subscription = events.subscribe({
        next: (evt) => {
          void stream.writeSSE({ data: JSON.stringify(evt), event: 'message' });
        },
        error: (err) => {
          console.error(`[ag-ui/${opts.kind}] stream error:`, err);
        },
      });
      c.req.raw.signal.addEventListener('abort', () => subscription.unsubscribe());

      // Wait for the observable to complete before closing the SSE stream.
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (subscription.closed) {
            clearInterval(check);
            resolve();
          }
        }, 200);
      });
    } catch (err: any) {
      console.error(`[ag-ui/${opts.kind}] error:`, err);
      const messageId = uuidv4();
      const msg = err?.message ?? '处理请求时出现问题';
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: `⚠ ${msg}` }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId }), event: 'message' });
      await stream.writeSSE({ data: JSON.stringify({ type: 'RUN_ERROR', delta: msg }), event: 'message' });
    }
  });
}

/**
 * POST /ag-ui/recruiter — Recruiter-facing AG-UI SSE endpoint.
 * Public (no auth). Guardrails live inside runAgentTurn (input) and the
 * agent's own output processor.
 */
app.post('/ag-ui/recruiter', (c) =>
  handleAgUi(c, { kind: 'recruiter', resourceId: 'recruiter-visitors' }),
);

/**
 * POST /ag-ui/admin — Admin AG-UI SSE endpoint (JWT).
 * Full tool access through the Mastra admin agent.
 */
app.post('/ag-ui/admin', async (c) => {
  const username = verifyToken(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return handleAgUi(c, { kind: 'admin', resourceId: `admin-${username}` });
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
