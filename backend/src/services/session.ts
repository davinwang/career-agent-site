import { get, all, run } from '../db/client.js';

interface SessionRow {
  id: string;
  side: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

export interface SessionMessage {
  role: string;
  content: string;
  tool_calls?: any;
}

/**
 * Ensure a session exists in the database. Creates it if it doesn't exist.
 * Safe to call multiple times (idempotent).
 */
export async function ensureSession(sessionId: string, side: 'recruiter' | 'admin'): Promise<void> {
  const existing = await get<SessionRow>(
    'SELECT id FROM sessions WHERE id = ?',
    [sessionId],
  );

  if (!existing) {
    const now = new Date().toISOString();
    await run(
      'INSERT INTO sessions (id, side, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)',
      [sessionId, side, now, now, null],
    );
  }
}

/**
 * Load message history for a session.
 * Returns messages in chronological order, ready to pass to the LLM.
 */
export async function loadSessionHistory(sessionId: string): Promise<SessionMessage[]> {
  const rows = await all<MessageRow>(
    'SELECT role, content, tool_calls FROM messages WHERE session_id = ? ORDER BY id ASC',
    [sessionId],
  );

  return rows.map((row) => {
    const msg: SessionMessage = { role: row.role, content: row.content };
    if (row.tool_calls) {
      try {
        msg.tool_calls = JSON.parse(row.tool_calls);
      } catch {
        // Ignore malformed tool_calls
      }
    }
    return msg;
  });
}

/**
 * Persist a user message and the assistant's response to the database.
 * Called by AG-UI endpoints after each exchange.
 */
export async function persistMessages(
  sessionId: string,
  side: 'recruiter' | 'admin',
  userMessage: string,
  assistantMessage: string,
  toolCalls?: any,
): Promise<void> {
  // Ensure session exists
  await ensureSession(sessionId, side);

  const now = new Date().toISOString();

  // Insert user message
  await run(
    'INSERT INTO messages (session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)',
    [sessionId, 'user', userMessage, null, now],
  );

  // Insert assistant message
  const serializedToolCalls = toolCalls ? JSON.stringify(toolCalls) : null;
  await run(
    'INSERT INTO messages (session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)',
    [sessionId, 'assistant', assistantMessage, serializedToolCalls, now],
  );

  // Update session timestamp
  await run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
}

/**
 * Get the last N messages for context window management.
 * Returns messages in chronological order.
 */
export async function getRecentMessages(sessionId: string, limit: number = 20): Promise<SessionMessage[]> {
  const rows = await all<MessageRow>(
    `SELECT role, content, tool_calls FROM messages
     WHERE session_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [sessionId, limit],
  );

  // Reverse to chronological order
  return rows.reverse().map((row) => {
    const msg: SessionMessage = { role: row.role, content: row.content };
    if (row.tool_calls) {
      try {
        msg.tool_calls = JSON.parse(row.tool_calls);
      } catch {
        // Ignore malformed tool_calls
      }
    }
    return msg;
  });
}
