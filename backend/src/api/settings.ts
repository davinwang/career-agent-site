import { Hono } from 'hono';
import { z } from 'zod';
import { get, run } from '../db/client.js';
import { authRequired, type AppEnv } from './auth.js';

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
