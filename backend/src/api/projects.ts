import { Hono } from 'hono';
import { z } from 'zod';
import { get, all, run } from '../db/client.js';
import { adminRequired, readAllowed, type AppEnv } from './auth.js';
import { cloneRepo, runProjectAnalysis, deleteProjectDir, type ProjectRow } from '../services/projects.js';

/** Project shape returned to the admin frontend (heavy doc columns excluded). */
interface ProjectDto {
  id: string;
  name: string;
  repo_url: string | null;
  status: string;
  created_at: string;
}

const addRepoSchema = z
  .object({
    // The admin frontend sends `repo_url`; accept the shorter `url` alias too.
    repo_url: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    name: z.string().optional(),
  })
  .refine((v) => Boolean(v.repo_url || v.url), { message: 'repo_url is required' });

export const projectRoutes = new Hono<AppEnv>();

/**
 * GET /api/projects/questions -> { questions: { [projectName]: RecruiterQuestion[] } }
 * Public: the recruiter portal renders these under each project card.
 * Only projects whose analysis finished (status=done) are included, and only
 * the safe fields (question text + needs_input flag) leave the server.
 */
projectRoutes.get('/questions', async (c) => {
  const rows = await all<{ name: string; resume_content: string | null }>(
    "SELECT name, resume_content FROM projects WHERE status = 'done' AND resume_content IS NOT NULL ORDER BY created_at ASC",
  );
  const questions: Record<string, { question: string; needs_input: boolean }[]> = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.resume_content!) as { recruiter_questions?: unknown };
      if (!Array.isArray(parsed.recruiter_questions)) continue;
      const list = parsed.recruiter_questions
        .filter(
          (q): q is { question: string; needs_input?: boolean } =>
            typeof q === 'object' && q !== null && typeof (q as { question?: unknown }).question === 'string',
        )
        .map((q) => ({ question: q.question, needs_input: q.needs_input === true }));
      if (list.length > 0) questions[row.name] = list;
    } catch {
      /* corrupt resume_content — skip */
    }
  }
  return c.json({ questions });
});

/**
 * GET /api/projects -> { projects: [...] } newest first. Admin only.
 */
projectRoutes.get('/', readAllowed, async (c) => {
  const rows = await all<ProjectDto>(
    'SELECT id, name, repo_url, status, created_at FROM projects ORDER BY created_at DESC',
  );
  return c.json({ projects: rows });
});

/**
 * POST /api/projects -> clone a repo and register it. Body: { repo_url|url, name? }
 * The clone is awaited (so failures surface), analysis is triggered separately.
 */
projectRoutes.post('/', adminRequired, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = addRepoSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { repo_url, name? }' }, 400);
  }

  const url = parsed.data.repo_url || parsed.data.url!;
  const result = await cloneRepo(url, parsed.data.name);
  if (!result.ok) {
    return c.json({ error: result.error }, 502);
  }

  return c.json({
    id: result.id,
    name: result.name,
    repo_url: url,
    status: result.status,
    created_at: result.created_at,
  } satisfies ProjectDto);
});

/**
 * POST /api/projects/:id/analyze -> kick off LLM analysis in the background.
 * Returns 202 immediately; poll GET /api/projects for the status transition.
 */
projectRoutes.post('/:id/analyze', adminRequired, async (c) => {
  const id = c.req.param('id');
  const project = await get<ProjectRow>('SELECT id, status FROM projects WHERE id = ?', [id]);
  if (!project) {
    return c.json({ error: 'project not found' }, 404);
  }
  if (project.status === 'analyzing') {
    return c.json({ error: 'project is already being analyzed' }, 409);
  }

  await run('UPDATE projects SET status = ? WHERE id = ?', ['analyzing', id]);

  // Fire-and-forget: runProjectAnalysis persists the outcome (done/error) itself.
  runProjectAnalysis(id).catch((err) => {
    console.error('[projects/analyze] background analysis crashed:', err);
  });

  return c.json({ ok: true, id, status: 'analyzing' }, 202);
});

/**
 * GET /api/projects/:id/doc -> { doc, resume_content }. Admin only.
 * Declared before DELETE so the literal segments don't collide.
 */
projectRoutes.get('/:id/doc', adminRequired, async (c) => {
  const id = c.req.param('id');
  const project = await get<ProjectRow>(
    'SELECT id, doc, resume_content FROM projects WHERE id = ?',
    [id],
  );
  if (!project) {
    return c.json({ error: 'project not found' }, 404);
  }

  // resume_content is stored as a JSON string; surface it parsed when possible.
  let resumeContent: unknown = null;
  if (project.resume_content) {
    try {
      resumeContent = JSON.parse(project.resume_content);
    } catch {
      resumeContent = project.resume_content;
    }
  }

  return c.json({ doc: project.doc ?? '', resume_content: resumeContent });
});

/**
 * DELETE /api/projects/:id -> remove the record and its cloned directory.
 */
projectRoutes.delete('/:id', adminRequired, async (c) => {
  const id = c.req.param('id');
  const project = await get<ProjectRow>(
    'SELECT id, name, repo_url FROM projects WHERE id = ?',
    [id],
  );
  if (!project) {
    return c.json({ error: 'project not found' }, 404);
  }

  await run('DELETE FROM projects WHERE id = ?', [id]);
  await deleteProjectDir(project);
  return c.json({ ok: true, id });
});
