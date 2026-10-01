import { Hono } from 'hono';
import { get, all, run } from '../db/client.js';
import { adminRequired, readAllowed, type AppEnv } from './auth.js';

interface KnowledgeRow {
  id: string;
  filename: string;
  source_type: string;
  metadata: string | null;
  created_at: string;
}

export const knowledgeRoutes = new Hono<AppEnv>();

/**
 * GET /api/knowledge -> { knowledge: [...] } newest first. Admin only.
 * Omits the heavy content/chunks columns — the list view doesn't need them.
 */
knowledgeRoutes.get('/', readAllowed, async (c) => {
  const rows = await all<KnowledgeRow>(
    'SELECT id, filename, source_type, metadata, created_at FROM knowledge ORDER BY created_at DESC',
  );
  return c.json({ knowledge: rows });
});

/**
 * DELETE /api/knowledge/:id -> remove a knowledge item. Admin only.
 */
knowledgeRoutes.delete('/:id', adminRequired, async (c) => {
  const id = c.req.param('id');
  const existing = await get<{ id: string }>('SELECT id FROM knowledge WHERE id = ?', [id]);
  if (!existing) {
    return c.json({ error: 'knowledge item not found' }, 404);
  }
  await run('DELETE FROM knowledge WHERE id = ?', [id]);
  return c.json({ ok: true, id });
});
