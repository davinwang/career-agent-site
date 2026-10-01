import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Resolve the workspace root (the directory that contains backend/, data/, fonts/).
 * This module lives at backend/src/config.ts -> ../../ from src => backend, ../ => root.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
/** backend/ directory */
export const BACKEND_DIR = path.resolve(here, '..');
/** workspace root directory */
export const ROOT_DIR = path.resolve(BACKEND_DIR, '..');

/** Resolve a possibly-relative path against the backend dir, or return absolute as-is. */
function resolveFromBackend(p: string | undefined, fallback: string): string {
  const value = p && p.trim() ? p.trim() : fallback;
  return path.isAbsolute(value) ? value : path.resolve(BACKEND_DIR, value);
}

function listEnv(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4111', 10),

  // LLM
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'deepseek',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
    apiKey: process.env.LLM_API_KEY ?? '',
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
  },

  // Auth
  jwtSecret: process.env.JWT_SECRET ?? 'change-this-to-a-random-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  // Guest mode: allows read-only anonymous access to the admin portal via a
  // restricted guest token. Off by default; enable with GUEST_MODE=true.
  guestMode: process.env.GUEST_MODE === 'true',
  // Guest tokens live shorter than admin ones.
  guestExpiresIn: process.env.GUEST_EXPIRES_IN ?? '12h',

  // Paths
  databasePath: resolveFromBackend(process.env.DATABASE_PATH, path.join('..', 'data', 'db', 'job-agent.db')),
  uploadDir: resolveFromBackend(process.env.UPLOAD_DIR, path.join('..', 'data', 'uploads')),
  repoDir: resolveFromBackend(process.env.REPO_DIR, path.join('..', 'data', 'repos')),
  fontDir: resolveFromBackend(process.env.FONT_DIR, path.join('..', 'fonts')),

  // CORS
  frontendOrigins: listEnv('FRONTEND_ORIGINS', ['http://localhost:5173', 'http://localhost:5174']),

  // Upload constraints
  maxUploadBytes: 50 * 1024 * 1024,
  allowedUploadExtensions: [
    '.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.zip',
    '.png', '.jpg', '.jpeg', '.webp', '.gif',
  ],
  imageExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
} as const;
