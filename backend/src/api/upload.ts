import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { authRequired, type AppEnv } from './auth.js';
import { all, get, run } from '../db/client.js';
import { IMAGE_EXTENSIONS, normalizeImage } from '../services/images.js';

export const uploadRoutes = new Hono<AppEnv>();

function extname(filename: string): string {
  return path.extname(filename).toLowerCase();
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

interface UploadRow {
  id: string;
  stored_name: string;
  original_name: string;
  ext: string;
  size: number;
  created_at: string;
}

/**
 * POST /api/upload -> multipart file upload. Admin only.
 * Saves the file under UPLOAD_DIR, records the original filename in the
 * uploads table (so originals can be listed / downloaded / deleted later),
 * and returns its stored metadata.
 *
 * Accepted extensions: config.allowedUploadExtensions
 * Max size: config.maxUploadBytes (50 MB)
 */
uploadRoutes.post('/', authRequired, async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!(file instanceof File)) {
    return c.json({ error: 'a single file field named "file" is required' }, 400);
  }

  const ext = extname(file.name);
  const allowed: readonly string[] = config.allowedUploadExtensions;
  if (!allowed.includes(ext)) {
    return c.json({ error: `unsupported file type "${ext || 'unknown'}"`, allowed }, 415);
  }

  if (file.size > config.maxUploadBytes) {
    return c.json({ error: 'file exceeds 50MB limit', size: file.size }, 413);
  }

  // --- Image normalization (security) --------------------------------------
  // Avatars and logos are re-encoded through sharp before touching disk:
  // the stored file is a clean PNG of a fixed size, and anything that is
  // not a decodable image (polyglot, disguised executable) is rejected 415.
  let buffer: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
  let storedExt = ext;
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    try {
      buffer = await normalizeImage(buffer, 'logo');
    } catch {
      return c.json({ error: 'file is not a valid image (normalization failed)' }, 415);
    }
    storedExt = '.png';
  }

  const storedName = `${uuidv4()}${storedExt}`;
  await fs.mkdir(config.uploadDir, { recursive: true });
  const dest = path.join(config.uploadDir, storedName);

  await fs.writeFile(dest, buffer);

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  await run(
    'INSERT OR REPLACE INTO uploads (id, stored_name, original_name, ext, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, storedName, file.name, storedExt, buffer.length, createdAt],
  );

  return c.json({
    ok: true,
    id,
    original_name: file.name,
    stored_name: storedName,
    size: buffer.length,
    extension: storedExt,
    normalized: storedExt !== ext,
    path: dest,
    uploaded_at: createdAt,
  });
});

/**
 * GET /api/upload -> list uploaded originals, newest first. Admin only.
 */
uploadRoutes.get('/', authRequired, async (c) => {
  const rows = await all<UploadRow>(
    'SELECT id, stored_name, original_name, ext, size, created_at FROM uploads ORDER BY created_at DESC',
  );
  return c.json({ uploads: rows });
});

/** Resolve a stored-name param safely and fetch its DB row. */
async function resolveStored(c: { req: { param: (k: string) => string } }) {
  const storedName = path.basename(c.req.param('storedName'));
  if (!path.extname(storedName)) return { row: null, storedName };
  const row = await get<UploadRow>('SELECT * FROM uploads WHERE stored_name = ?', [storedName]);
  return { row, storedName };
}

/**
 * GET /api/upload/:storedName -> download the original file. Admin only.
 */
uploadRoutes.get('/:storedName', authRequired, async (c) => {
  const { row } = await resolveStored(c);
  if (!row) return c.json({ error: 'upload not found' }, 404);
  const filePath = path.join(config.uploadDir, row.stored_name);
  try {
    const data = await fs.readFile(filePath);
    return c.body(
      new Uint8Array(data),
      200,
      {
        'Content-Type': MIME_BY_EXT[row.ext] ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
        'Content-Length': String(data.length),
      },
    );
  } catch {
    return c.json({ error: 'file missing on disk (record stale)' }, 410);
  }
});

/**
 * DELETE /api/upload/:storedName -> remove the original file + its record.
 * Note: knowledge extracted from the file stays in the knowledge base.
 */
uploadRoutes.delete('/:storedName', authRequired, async (c) => {
  const { row } = await resolveStored(c);
  if (!row) return c.json({ error: 'upload not found' }, 404);
  const filePath = path.join(config.uploadDir, row.stored_name);
  try {
    await fs.unlink(filePath);
  } catch {
    /* file already gone — still drop the record */
  }
  await run('DELETE FROM uploads WHERE id = ?', [row.id]);
  return c.json({ ok: true, id: row.id });
});
