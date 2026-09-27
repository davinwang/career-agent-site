import { Hono } from 'hono';
import { z } from 'zod';
import { get, all, run } from '../db/client.js';
import { authRequired, type AppEnv } from './auth.js';
import { generateResumePdf, type ResumeData } from '../services/pdf.js';

interface ResumeRow {
  lang: string;
  data: string;
  updated_at: string;
}

interface LangRow {
  lang: string;
}

export const resumeRoutes = new Hono<AppEnv>();

/**
 * GET /api/resume/languages -> ["zh", "en", ...]
 * Declared before /:lang so the literal path wins over the param route.
 */
resumeRoutes.get('/languages', async (c) => {
  const rows = await all<LangRow>('SELECT lang FROM resume ORDER BY lang ASC');
  return c.json({ languages: rows.map((r) => r.lang) });
});

/**
 * GET /api/resume/pdf?lang=zh -> rendered resume as a downloadable PDF.
 * Public: recruiters download the same resume shown on the public page.
 * Declared before /:lang so the literal "pdf" segment wins over the param route.
 */
resumeRoutes.get('/pdf', async (c) => {
  const lang = c.req.query('lang') || 'zh';
  const row = await get<ResumeRow>('SELECT lang, data FROM resume WHERE lang = ?', [lang]);
  if (!row) {
    return c.json({ error: `resume not found for lang "${lang}"` }, 404);
  }

  let data: ResumeData;
  try {
    data = JSON.parse(row.data) as ResumeData;
  } catch {
    return c.json({ error: 'stored resume data is corrupt' }, 500);
  }
  if (!data || typeof data !== 'object' || !data.name) {
    return c.json({ error: `no resume published for lang "${lang}"` }, 404);
  }

  try {
    const pdf = await generateResumePdf(data, lang);
    const bytes = new Uint8Array(pdf);
    return c.body(bytes.buffer as ArrayBuffer, 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="resume-${lang}.pdf"`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to render resume PDF';
    console.error('[resume/pdf] generation failed:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/resume/:lang -> resume JSON for the given language.
 * Public: recruiters need the resume to render the public page.
 */
resumeRoutes.get('/:lang', async (c) => {
  const lang = c.req.param('lang') || 'zh';
  const row = await get<ResumeRow>('SELECT lang, data, updated_at FROM resume WHERE lang = ?', [lang]);
  if (!row) {
    return c.json({ error: `resume not found for lang "${lang}"` }, 404);
  }
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return c.json({ error: 'stored resume data is corrupt' }, 500);
  }
  return c.json({ lang: row.lang, updated_at: row.updated_at, data });
});

const putBodySchema = z.object({
  data: z.record(z.unknown()),
});

/**
 * PUT /api/resume/:lang -> upsert resume JSON. Admin only.
 * Body: { data: <resume object> }
 */
resumeRoutes.put('/:lang', authRequired, async (c) => {
  const lang = c.req.param('lang') || 'zh';
  const raw = await c.req.json().catch(() => null);
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { data: object }' }, 400);
  }

  const payload = JSON.stringify(parsed.data.data);
  const updated = new Date().toISOString();
  const existing = await get<LangRow>('SELECT lang FROM resume WHERE lang = ?', [lang]);
  if (existing) {
    await run('UPDATE resume SET data = ?, updated_at = ? WHERE lang = ?', [payload, updated, lang]);
  } else {
    await run('INSERT INTO resume (lang, data, updated_at) VALUES (?, ?, ?)', [lang, payload, updated]);
  }
  return c.json({ lang, updated_at: updated, ok: true });
});
