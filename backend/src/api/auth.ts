import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { get } from '../db/client.js';

/** Shared Hono environment: authenticated requests carry `username`. */
export type AppEnv = {
  Variables: {
    username: string;
  };
};

interface AdminCredentialRow {
  username: string;
  password_hash: string;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function signToken(username: string): string {
  return jwt.sign({ sub: username, username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Extract and verify the Bearer token; returns the username or null. */
export function verifyToken(headerValue: string | undefined): string | null {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return null;
  const token = headerValue.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    return payload.username ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Middleware that rejects requests without a valid Bearer token. On success it
 * stores the authenticated username on the context.
 */
export const authRequired: MiddlewareHandler<AppEnv> = async (c, next) => {
  const username = verifyToken(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('username', username);
  await next();
};

export const authRoutes = new Hono<AppEnv>();

/** POST /api/auth/login -> { token } */
authRoutes.post('/login', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'username and password are required' }, 400);
  }

  const { username, password } = parsed.data;
  const row = await get<AdminCredentialRow>(
    'SELECT username, password_hash FROM admin_credentials WHERE username = ?',
    [username],
  );

  if (!row) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = signToken(row.username);
  return c.json({ token });
});

/** GET /api/auth/me -> the authenticated username (handy for the admin UI). */
authRoutes.get('/me', authRequired, (c) => {
  return c.json({ username: c.get('username') });
});
