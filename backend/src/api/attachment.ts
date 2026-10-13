import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { all, run } from '../db/client.js';
import type { AppEnv } from './auth.js';

export const attachmentRoutes = new Hono<AppEnv>();

/**
 * Recruiter-facing attachment upload (JD, role description, etc).
 *
 * Public (no auth — visitors are anonymous), but deliberately narrower than
 * the admin upload: documents only (pdf/docx/txt/md), 5 MB cap, never served
 * back to the visitor, and stored in a separate `visitor_uploads` table so
 * they can't collide with or pollute the admin uploads listing.
 *
 * The text is extracted server-side immediately (pdf-parse / mammoth are
 * already dependencies for the knowledge pipeline) and stored INSTEAD of
 * relying on the raw file: the agent reads the extracted text through the
 * `read_visitor_attachment` tool and never touches binaries.
 */

export const ALLOWED_ATTACHMENT_EXT = ['.pdf', '.docx', '.txt', '.md'] as const;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface VisitorUploadRow {
  id: string;
  session_id: string;
  original_name: string;
  ext: string;
  size: number;
  text: string;
  created_at: string;
}

async function extractText(ext: string, buffer: Buffer): Promise<string> {
  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return (result.text || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  }
  // .txt / .md
  return buffer.toString('utf-8').trim();
}

attachmentRoutes.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  const sessionId = typeof body['session_id'] === 'string' ? body['session_id'] : '';

  if (!(file instanceof File)) {
    return c.json({ error: 'a single file field named "file" is required' }, 400);
  }
  if (!sessionId) {
    return c.json({ error: 'session_id field is required' }, 400);
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!(ALLOWED_ATTACHMENT_EXT as readonly string[]).includes(ext)) {
    return c.json({ error: `unsupported file type "${ext || 'unknown'}"`, allowed: ALLOWED_ATTACHMENT_EXT }, 415);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: 'file exceeds 5MB limit', size: file.size }, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractText(ext, buffer);
  } catch (err: any) {
    return c.json({ error: `could not extract text: ${err.message}` }, 415);
  }
  if (!text) {
    return c.json({ error: 'no readable text found in the file (scanned PDF? try a text version)' }, 415);
  }
  // Cap the stored text — a JD rarely exceeds this; keeps agent context sane.
  const MAX_TEXT = 30_000;
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n…[truncated]`;

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  await run(
    'INSERT INTO visitor_uploads (id, session_id, original_name, ext, size, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, sessionId, file.name.slice(0, 200), ext, buffer.length, text, createdAt],
  );

  return c.json({
    ok: true,
    id,
    original_name: file.name,
    size: buffer.length,
    chars: text.length,
    uploaded_at: createdAt,
  });
});

/**
 * GET /api/attachment?session_id=... -> list this session's attachments
 * (metadata only). Used by the frontend to show chips for what's attached.
 */
attachmentRoutes.get('/', async (c) => {
  const sessionId = c.req.query('session_id') || '';
  if (!sessionId) return c.json({ attachments: [] });
  const rows = await all<Omit<VisitorUploadRow, 'text'>>(
    'SELECT id, session_id, original_name, ext, size, created_at FROM visitor_uploads WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId],
  );
  return c.json({ attachments: rows });
});

/**
 * Text lookup used by the agent tool. Kept next to the route so the storage
 * contract lives in one file.
 */
export async function getVisitorAttachments(sessionId: string): Promise<Array<{ original_name: string; ext: string; chars: number; created_at: string; text: string }>> {
  const rows = await all<{ original_name: string; ext: string; chars: number | null; created_at: string; text: string }>(
    'SELECT original_name, ext, length(text) as chars, created_at, text FROM visitor_uploads WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId],
  );
  return rows.map((r) => ({
    original_name: r.original_name,
    ext: r.ext,
    chars: Number(r.chars) || 0,
    created_at: r.created_at,
    text: r.text,
  }));
}
