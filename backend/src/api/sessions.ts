import { randomUUID as uuid } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { get, all, run } from '../db/client.js';
import { authRequired, adminRequired, readAllowed, type AppEnv } from './auth.js';

interface SessionRow {
  id: string;
  side: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  message_count: number;
}

interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

const sideSchema = z.enum(['recruiter', 'admin']);

const createSessionSchema = z.object({
  id: z.string().min(1),
  side: sideSchema,
  metadata: z.record(z.unknown()).optional(),
});

const appendMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  tool_calls: z.unknown().optional(),
});

export const sessionRoutes = new Hono<AppEnv>();

/**
 * GET /api/sessions?side=recruiter|admin -> list sessions. Admin only.
 */
sessionRoutes.get('/', readAllowed, async (c) => {
  const side = c.req.query('side');
  let rows: SessionRow[];
  // message_count lets the admin UI hide sessions that were opened but never
  // received any message (recruiters who just glanced at the portal).
  if (side) {
    const parsed = sideSchema.safeParse(side);
    if (!parsed.success) {
      return c.json({ error: 'side must be "recruiter" or "admin"' }, 400);
    }
    rows = await all<SessionRow>(
      `SELECT s.id, s.side, s.created_at, s.updated_at, s.metadata,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
       FROM sessions s WHERE s.side = ? ORDER BY s.updated_at DESC`,
      [parsed.data],
    );
  } else {
    rows = await all<SessionRow>(
      `SELECT s.id, s.side, s.created_at, s.updated_at, s.metadata,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
       FROM sessions s ORDER BY s.updated_at DESC`,
    );
  }
  return c.json({ sessions: rows });
});

/**
 * GET /api/sessions/current?side=admin -> the caller's most recent session of
 * that side, creating it (with a server-generated id) if none exists yet.
 * Server-side session identity: the admin chat follows the authenticated user
 * across browsers/devices instead of a per-browser localStorage id.
 */
sessionRoutes.get('/current', adminRequired, async (c) => {
  const side = c.req.query('side') ?? 'admin';
  const parsed = sideSchema.safeParse(side);
  if (!parsed.success) {
    return c.json({ error: 'side must be "recruiter" or "admin"' }, 400);
  }
  if (parsed.data !== 'admin') {
    // Only the admin side is identity-scoped today.
    return c.json({ error: 'side must be "admin"' }, 400);
  }
  const username = c.get('username') as string;
  const marker = `owner:${username}`;

  // Latest admin session for this user (marker in metadata).
  const rows = await all<SessionRow>(
    "SELECT id, side, created_at, updated_at, metadata FROM sessions WHERE side = 'admin' AND metadata = ? ORDER BY updated_at DESC LIMIT 1",
    [marker],
  );
  if (rows.length > 0) {
    return c.json({ session: rows[0] });
  }

  const id = `admin-${uuid()}`;
  const now = new Date().toISOString();
  await run(
    'INSERT INTO sessions (id, side, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)',
    [id, 'admin', now, now, marker],
  );
  const created = await get<SessionRow>('SELECT id, side, created_at, updated_at, metadata FROM sessions WHERE id = ?', [id]);
  return c.json({ session: created });
});

/**
 * POST /api/sessions/current?side=admin -> start a NEW admin chat for the
 * caller. The fresh session carries the owner marker, so it immediately
 * becomes the "current" session (latest updated_at wins) on every device.
 */
sessionRoutes.post('/current', adminRequired, async (c) => {
  const side = c.req.query('side') ?? 'admin';
  const parsed = sideSchema.safeParse(side);
  if (!parsed.success || parsed.data !== 'admin') {
    return c.json({ error: 'side must be "admin"' }, 400);
  }
  const username = c.get('username') as string;
  const marker = `owner:${username}`;
  const id = `admin-${uuid()}`;
  const now = new Date().toISOString();
  await run(
    'INSERT INTO sessions (id, side, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)',
    [id, 'admin', now, now, marker],
  );
  const created = await get<SessionRow>('SELECT id, side, created_at, updated_at, metadata FROM sessions WHERE id = ?', [id]);
  return c.json({ session: created });
});

/**
 * GET /api/sessions/:id/messages -> message history for a session.
 */
sessionRoutes.get('/:id/messages', async (c) => {
  const id = c.req.param('id');
  const session = await get<SessionRow>('SELECT id FROM sessions WHERE id = ?', [id]);
  if (!session) {
    return c.json({ error: 'session not found' }, 404);
  }
  const rows = await all<MessageRow>(
    'SELECT id, session_id, role, content, tool_calls, created_at FROM messages WHERE session_id = ? ORDER BY id ASC',
    [id],
  );
  return c.json({ messages: rows });
});

/**
 * POST /api/sessions -> create a new session. Body: { id, side, metadata? }
 */
sessionRoutes.post('/', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { id, side: "recruiter"|"admin", metadata? }' }, 400);
  }

  const now = new Date().toISOString();
  const existing = await get<SessionRow>('SELECT id FROM sessions WHERE id = ?', [parsed.data.id]);
  if (existing) {
    return c.json({ error: 'session already exists' }, 409);
  }

  const metadata = parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null;
  await run(
    'INSERT INTO sessions (id, side, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)',
    [parsed.data.id, parsed.data.side, now, now, metadata],
  );
  return c.json({ id: parsed.data.id, side: parsed.data.side, created_at: now, updated_at: now });
});

/**
 * POST /api/sessions/:id/messages -> append a message. Body: { role, content, tool_calls? }
 */
sessionRoutes.post('/:id/messages', async (c) => {
  const id = c.req.param('id');
  const session = await get<SessionRow>('SELECT id FROM sessions WHERE id = ?', [id]);
  if (!session) {
    return c.json({ error: 'session not found' }, 404);
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = appendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'body must be { role, content, tool_calls? }' }, 400);
  }

  const now = new Date().toISOString();
  const toolCalls =
    parsed.data.tool_calls === undefined ? null : JSON.stringify(parsed.data.tool_calls);

  const result = await run(
    'INSERT INTO messages (session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, parsed.data.role, parsed.data.content, toolCalls, now],
  );
  await run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, id]);

  return c.json({ id: Number(result.lastInsertRowid), session_id: id, created_at: now });
});
