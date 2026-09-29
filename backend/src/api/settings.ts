import { Hono } from 'hono';
import { z } from 'zod';
import { get, run } from '../db/client.js';
import { authRequired, type AppEnv } from './auth.js';
import {
  savePat, clearPat, clearGithub, getGithubStatus,
  verifyToken as verifyGithubToken, listRepos,
} from '../services/github.js';

export const SKIN_IDS = ['classic', 'modern', 'emerald'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

interface SettingRow {
  value: string;
}

const setSkinSchema = z.object({
  skin: z.enum(SKIN_IDS),
});

export const settingsRoutes = new Hono<AppEnv>();

/**
 * GET /api/settings/ui-theme -> { skin }
 * Admin only. The admin portal's own look & feel — the recruiter portal no
 * longer follows it (visitors pick their own skin client-side).
 */
settingsRoutes.get('/ui-theme', authRequired, async (c) => {
  try {
    const row = await get<SettingRow>(
      "SELECT value FROM settings WHERE key = 'admin_skin'",
    );
    const skin = row?.value && (SKIN_IDS as readonly string[]).includes(row.value)
      ? row.value
      : 'classic';
    return c.json({ skin });
  } catch {
    // Table may not exist yet on very old volumes — default gracefully.
    return c.json({ skin: 'classic' });
  }
});

/**
 * PUT /api/settings/ui-theme { skin } -> { ok, skin }. Admin only.
 * Persists the admin portal's skin so it follows the account across devices.
 */
settingsRoutes.put('/ui-theme', authRequired, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = setSkinSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: `skin must be one of: ${SKIN_IDS.join(', ')}` }, 400);
  }
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('admin_skin', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [parsed.data.skin],
  );
  return c.json({ ok: true, skin: parsed.data.skin });
});

// --- GitHub integration --------------------------------------------------------

const patSchema = z.object({ pat: z.string().min(20) });

/**
 * GET /api/settings/github -> token hosting status (never the token itself).
 */
settingsRoutes.get('/github', authRequired, async (c) => {
  try {
    return c.json(await getGithubStatus());
  } catch {
    return c.json({ pat: false, oauth: { bound: false, login: null }, source: null, user: null });
  }
});

/**
 * PUT /api/settings/github { pat } -> verify against GitHub /user, then store
 * encrypted. Admin only.
 */
settingsRoutes.put('/github', authRequired, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = patSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { pat: string }' }, 400);
  }

  // Verify against the official endpoint BEFORE persisting.
  let login: string;
  try {
    const v = await verifyGithubToken(parsed.data.pat.trim());
    login = v.login;
  } catch (err: any) {
    return c.json({ error: err.message ?? 'PAT 验证失败' }, 400);
  }

  await savePat(parsed.data.pat);
  return c.json({ ok: true, login });
});

/**
 * DELETE /api/settings/github -> remove hosted credentials (PAT + OAuth).
 */
settingsRoutes.delete('/github', authRequired, async (c) => {
  await clearGithub();
  return c.json({ ok: true });
});

/**
 * GET /api/settings/github/repos -> repos reachable by the hosted token.
 */
settingsRoutes.get('/github/repos', authRequired, async (c) => {
  const { getGithubToken } = await import('../services/github.js');
  const current = await getGithubToken();
  if (!current) {
    return c.json({ error: '尚未托管 GitHub PAT 或绑定 GitHub 账号' }, 400);
  }
  const repos = await listRepos(current.token);
  if ('error' in repos) {
    return c.json({ error: repos.error }, 502);
  }
  return c.json({ repos, source: current.source });
});
