/**
 * GitHub integration service.
 *
 * Two auth paths, both resolved through GitHub official endpoints:
 * 1. Hosted PAT  — user pastes a fine-grained/classic PAT; stored AES-256-GCM
 *    encrypted in the settings table (key derived from JWT_SECRET).
 * 2. OAuth App   — authorization-code flow against github.com/login/oauth.
 *    Stores the access token the same way.
 *
 * Whichever is present is used to (a) verify the token against the official
 * `/user` endpoint, (b) list repos the token can reach, and (c) inject auth
 * into git clone URLs for private repos.
 */

import crypto from 'node:crypto';
import { get, run } from '../db/client.js';
import { config } from '../config.js';

const PAT_KEY = 'github_pat';
const OAUTH_TOKEN_KEY = 'github_oauth_token';
const OAUTH_USER_KEY = 'github_oauth_user';

// --- encryption -------------------------------------------------------------

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(`github:${config.jwtSecret}`).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(stored: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf-8');
  } catch {
    return null;
  }
}

// --- token storage -----------------------------------------------------------

async function setSetting(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  );
}

async function getSetting(key: string): Promise<string | null> {
  const row = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function savePat(pat: string): Promise<void> {
  await setSetting(PAT_KEY, encrypt(pat.trim()));
}

export async function clearPat(): Promise<void> {
  await run('DELETE FROM settings WHERE key = ?', [PAT_KEY]);
}

/** The decrypted PAT, or null. OAuth token is the fallback. */
export async function getGithubToken(): Promise<{ token: string; source: 'pat' | 'oauth' } | null> {
  const pat = await getSetting(PAT_KEY);
  if (pat) {
    const plain = decrypt(pat);
    if (plain) return { token: plain, source: 'pat' };
  }
  const oauth = await getSetting(OAUTH_TOKEN_KEY);
  if (oauth) {
    const plain = decrypt(oauth);
    if (plain) return { token: plain, source: 'oauth' };
  }
  return null;
}

export async function getGithubStatus(): Promise<{
  pat: boolean;
  oauth: { bound: boolean; login: string | null };
  source: 'pat' | 'oauth' | null;
  user: string | null;
}> {
  const pat = await getSetting(PAT_KEY);
  const oauth = await getSetting(OAUTH_TOKEN_KEY);
  const oauthUser = await getSetting(OAUTH_USER_KEY);
  const current = await getGithubToken();
  return {
    pat: !!pat,
    oauth: { bound: !!oauth, login: oauthUser },
    source: current?.source ?? null,
    user: current ? await fetchLogin(current.token) : null,
  };
}

async function fetchLogin(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { login?: string };
    return json.login ?? null;
  } catch {
    return null;
  }
}

export async function saveOAuthToken(token: string, login: string): Promise<void> {
  await setSetting(OAUTH_TOKEN_KEY, encrypt(token));
  await setSetting(OAUTH_USER_KEY, login);
}

export async function clearGithub(): Promise<void> {
  await run("DELETE FROM settings WHERE key IN (?, ?)", [PAT_KEY, OAUTH_TOKEN_KEY]);
  await run("DELETE FROM settings WHERE key = ?", [OAUTH_USER_KEY]);
}

// --- GitHub API (official endpoints) ------------------------------------------

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'job-agent-site',
  };
}

export interface GithubRepoInfo {
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  language: string | null;
  pushed_at: string | null;
  default_branch: string;
}

/** Verify a PAT and return the authenticated login. Throws on invalid token. */
export async function verifyToken(token: string): Promise<{ login: string; scopes: string | null }> {
  const res = await fetch('https://api.github.com/user', {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) {
    throw new Error('PAT 无效或已过期（GitHub 返回 401）');
  }
  if (!res.ok) {
    throw new Error(`GitHub API 错误 (${res.status})`);
  }
  const json = (await res.json()) as { login?: string };
  if (!json.login) throw new Error('GitHub 未返回用户名');
  return { login: json.login, scopes: res.headers.get('x-oauth-scopes') };
}

/** List repos reachable by the token (affiliation=owner,collaborator,organization_member). */
export async function listRepos(token: string, perPage = 100): Promise<GithubRepoInfo[] | { error: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=${perPage}&sort=pushed&affiliation=owner,collaborator,organization_member`,
      { headers: githubHeaders(token), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return { error: `GitHub API 错误 (${res.status})` };
    const json = (await res.json()) as Array<{
      full_name: string; html_url: string; private: boolean; description: string | null;
      language: string | null; pushed_at: string | null; default_branch: string;
    }>;
    return json.map((r) => ({
      full_name: r.full_name,
      html_url: r.html_url,
      private: r.private,
      description: r.description,
      language: r.language,
      pushed_at: r.pushed_at,
      default_branch: r.default_branch,
    }));
  } catch (err: any) {
    return { error: err.message };
  }
}

// --- OAuth authorization-code flow --------------------------------------------

export function oauthConfigured(): boolean {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function oauthAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Exchange the authorization code for an access token (official endpoint). */
export async function oauthExchange(code: string, redirectUri: string): Promise<{ token: string } | { error: string }> {
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { access_token?: string; error_description?: string };
    if (!json.access_token) {
      return { error: json.error_description ?? 'GitHub 未返回 access_token' };
    }
    return { token: json.access_token };
  } catch (err: any) {
    return { error: err.message };
  }
}

// --- git clone URL injection ----------------------------------------------------

/** Build an authenticated clone URL when a token is available. */
export async function authedCloneUrl(httpsUrl: string): Promise<string> {
  const current = await getGithubToken();
  if (!current) return httpsUrl;
  if (!httpsUrl.startsWith('https://')) return httpsUrl; // ssh etc: leave alone
  return httpsUrl.replace('https://', `https://${encodeURIComponent(current.token)}@`);
}
