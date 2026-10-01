import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { get } from '../db/client.js';
import {
  oauthConfigured, oauthAuthorizeUrl, oauthExchange,
  verifyToken as verifyGithubToken, saveOAuthToken,
} from '../services/github.js';
import { run } from '../db/client.js';

/** Remove only the OAuth binding; a hosted PAT remains effective. */
export async function clearOAuthToken(): Promise<void> {
  await run("DELETE FROM settings WHERE key IN ('github_oauth_token', 'github_oauth_user')");
}

/** Shared Hono environment: authenticated requests carry `username`. */
export type AppEnv = {
  Variables: {
    username: string;
  };
};

/** JWT payload roles. */
type Role = 'admin' | 'guest';

interface AuthedJwt extends jwt.JwtPayload {
  username: string;
  role?: Role;
}

interface AdminCredentialRow {
  username: string;
  password_hash: string;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function signToken(username: string, role: Role = 'admin'): string {
  const expiresIn = role === 'guest' ? config.guestExpiresIn : config.jwtExpiresIn;
  return jwt.sign({ sub: username, username, role }, config.jwtSecret, {
    expiresIn,
  } as jwt.SignOptions);
}

/** Extract and verify the Bearer token; returns the username or null. */
export function verifyToken(headerValue: string | undefined): string | null {
  return verifyAuth(headerValue)?.username ?? null;
}

/** Full verification: username + role (guest tokens carry role='guest'). */
export function verifyAuth(headerValue: string | undefined): { username: string; role: Role } | null {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return null;
  const token = headerValue.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthedJwt;
    return { username: payload.username ?? payload.sub ?? '', role: payload.role === 'guest' ? 'guest' : 'admin' };
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

/**
 * Strict admin-only middleware: like authRequired but REJECTS guest tokens.
 * Use on every state-changing endpoint and on sensitive reads.
 */
export const adminRequired: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = verifyAuth(c.req.header('Authorization'));
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (auth.role === 'guest') {
    return c.json({ error: 'Forbidden: guest sessions are read-only' }, 403);
  }
  c.set('username', auth.username);
  await next();
};

/**
 * Read middleware: admin tokens always pass; guest tokens pass only when
 * guest mode is enabled AND the request is a safe read (GET/HEAD/OPTIONS).
 */
export const readAllowed: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = verifyAuth(c.req.header('Authorization'));
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (auth.role === 'guest') {
    if (!config.guestMode) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      return c.json({ error: 'Forbidden: guest sessions are read-only' }, 403);
    }
  }
  c.set('username', auth.username);
  await next();
};

/** True when the caller carries a valid NON-guest (admin) token. */
export function isAdminToken(headerValue: string | undefined): boolean {
  const auth = verifyAuth(headerValue);
  return auth !== null && auth.role === 'admin';
}

export const authRoutes = new Hono<AppEnv>();

/**
 * GET /api/auth/guest-status -> { enabled: boolean }
 * Public (no auth): lets the login page decide whether to render the
 * guest button at all.
 */
authRoutes.get('/guest-status', (c) => {
  return c.json({ enabled: config.guestMode });
});

/**
 * POST /api/auth/guest -> { token, username, guest: true }
 * Only when guest mode is enabled. Returns a short-lived JWT whose role is
 * 'guest'; every state-changing endpoint rejects it (403) server-side, and
 * the admin agent chat refuses to run for it.
 */
authRoutes.post('/guest', (c) => {
  if (!config.guestMode) {
    return c.json({ error: 'Guest mode is disabled' }, 404);
  }
  const token = signToken('guest', 'guest');
  return c.json({ token, username: 'guest', guest: true });
});

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
authRoutes.get('/me', adminRequired, (c) => {
  return c.json({ username: c.get('username') });
});

// --- GitHub OAuth binding (authorization-code flow, admin only) -----------------

/**
 * GET /api/auth/github/login -> { url } to redirect the browser to.
 * `redirect` is where GitHub sends the user back; it must be registered on the
 * OAuth App and live under the admin portal (callback page handles the code).
 */
authRoutes.get('/github/login', adminRequired, (c) => {
  if (!oauthConfigured()) {
    return c.json({ error: '服务端未配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET' }, 400);
  }
  const redirect = c.req.query('redirect') ?? `${origin(c)}/admin/github-callback`;
  const state = crypto.randomUUID().replace(/-/g, '');
  return c.json({ url: oauthAuthorizeUrl(state, redirect), state, redirect });
});

/**
 * GET /api/auth/github/callback?code&state — browser lands here from GitHub.
 * Exchanges the code, stores the token bound to this admin, then redirects
 * back to the admin portal with the result in the fragment.
 */
authRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const redirect = c.req.query('redirect') ?? `${origin(c)}/admin/github-callback`;
  if (!code) {
    return c.redirect(`${redirect}#error=missing_code`);
  }
  const result = await oauthExchange(code, redirect);
  if ('error' in result) {
    return c.redirect(`${redirect}#error=${encodeURIComponent(result.error)}`);
  }
  try {
    const { login } = await verifyGithubToken(result.token);
    await saveOAuthToken(result.token, login);
    return c.redirect(`${redirect}#bound=${encodeURIComponent(login)}`);
  } catch (err: any) {
    return c.redirect(`${redirect}#error=${encodeURIComponent(err.message ?? 'verify failed')}`);
  }
});

/**
 * DELETE /api/auth/github/unbind -> remove the OAuth binding (PAT untouched).
 */
authRoutes.delete('/github/unbind', adminRequired, async (c) => {
  await clearOAuthToken();
  return c.json({ ok: true });
});

function origin(c: { req: { url: string; header: (n: string) => string | undefined } }): string {
  const url = new URL(c.req.url);
  const host = c.req.header('x-forwarded-host') ?? url.host;
  const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}
