import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { get, all, run } from '../db/client.js';
import { authRequired, type AppEnv } from './auth.js';

interface SkillRow {
  id: string;
  name: string;
  prompt: string;
  enabled: number;
  priority: number;
  created_at: string;
}

/** Shape the admin frontend expects: `enabled` as a real boolean. */
function toSkillDto(row: SkillRow) {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    enabled: !!row.enabled,
    priority: Number(row.priority),
    created_at: row.created_at,
  };
}

const createSkillSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  priority: z.number().int().optional(),
});

const updateSkillSchema = z
  .object({
    name: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no updatable fields provided' });

export const skillRoutes = new Hono<AppEnv>();

/**
 * GET /api/skills -> { skills: [...] } ordered by priority DESC. Admin only.
 */
skillRoutes.get('/', authRequired, async (c) => {
  const rows = await all<SkillRow>(
    'SELECT id, name, prompt, enabled, priority, created_at FROM skills ORDER BY priority DESC, created_at ASC',
  );
  return c.json({ skills: rows.map(toSkillDto) });
});

/**
 * POST /api/skills -> create a skill. Body: { name, prompt, priority? }
 */
skillRoutes.post('/', authRequired, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createSkillSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { name, prompt, priority? }' }, 400);
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const priority = parsed.data.priority ?? 0;
  await run(
    'INSERT INTO skills (id, name, prompt, enabled, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, parsed.data.name, parsed.data.prompt, 1, priority, now],
  );
  return c.json(toSkillDto({ id, name: parsed.data.name, prompt: parsed.data.prompt, enabled: 1, priority, created_at: now }));
});

/**
 * PUT /api/skills/:id -> partial update. Body: { name?, prompt?, enabled?, priority? }
 */
skillRoutes.put('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const existing = await get<SkillRow>('SELECT id FROM skills WHERE id = ?', [id]);
  if (!existing) {
    return c.json({ error: 'skill not found' }, 404);
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = updateSkillSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body may contain { name?, prompt?, enabled?, priority? } with at least one field' }, 400);
  }

  // Build a dynamic SET clause from the provided fields only.
  const sets: string[] = [];
  const params: Array<string | number> = [];
  if (parsed.data.name !== undefined) {
    sets.push('name = ?');
    params.push(parsed.data.name);
  }
  if (parsed.data.prompt !== undefined) {
    sets.push('prompt = ?');
    params.push(parsed.data.prompt);
  }
  if (parsed.data.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(parsed.data.enabled ? 1 : 0);
  }
  if (parsed.data.priority !== undefined) {
    sets.push('priority = ?');
    params.push(parsed.data.priority);
  }

  await run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return c.json({ ok: true, id });
});

/**
 * DELETE /api/skills/:id -> remove a skill.
 */
skillRoutes.delete('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const existing = await get<SkillRow>('SELECT id FROM skills WHERE id = ?', [id]);
  if (!existing) {
    return c.json({ error: 'skill not found' }, 404);
  }
  await run('DELETE FROM skills WHERE id = ?', [id]);
  return c.json({ ok: true, id });
});
