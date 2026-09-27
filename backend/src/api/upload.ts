import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { authRequired, type AppEnv } from './auth.js';

export const uploadRoutes = new Hono<AppEnv>();

function extname(filename: string): string {
  return path.extname(filename).toLowerCase();
}

/**
 * POST /api/upload -> multipart file upload. Admin only.
 * Saves the file under UPLOAD_DIR and returns its stored metadata.
 *
 * Accepted extensions: .pdf .docx .doc .txt .md .json .zip
 * Max size: 50 MB
 *
 * NOTE: Actual parsing / knowledge-base ingestion happens in Phase 2. This
 * endpoint only persists the upload and reports back where it landed.
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

  const storedName = `${uuidv4()}${ext}`;
  await fs.mkdir(config.uploadDir, { recursive: true });
  const dest = path.join(config.uploadDir, storedName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(dest, buffer);

  return c.json({
    ok: true,
    original_name: file.name,
    stored_name: storedName,
    size: file.size,
    extension: ext,
    path: dest,
    uploaded_at: new Date().toISOString(),
  });
});
