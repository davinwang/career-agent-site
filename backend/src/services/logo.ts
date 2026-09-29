import sharp from 'sharp';
import { decodeIco } from 'icojs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

/**
 * findLogo pipeline (path A) — deterministic, no LLM decisions:
 *
 *   1. Bing web search  -> locate the official site domain
 *   2. Fetch the site   -> parse <link rel="...icon..."> / og:image / apple-touch-icon
 *   3. Fallback         -> Wikipedia REST summary thumbnail (school/company emblem)
 *   4. Download candidate image -> sharp-normalize to 256x256 PNG (same
 *      security pipeline as uploads: polyglots/bombs never touch disk)
 *   5. Save under UPLOAD_DIR, return the public /uploads/xxx.png path
 *
 * The agent never receives raw HTML or arbitrary binary — only the final
 * stored path. All network I/O is proxied through here with size/time caps.
 */

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Wikimedia blocks browser UAs from datacenter IPs (403) — identify ourselves. */
const WIKI_UA = 'job-agent-site/1.0 (https://aboutme.davin.wang; contact: admin@davin.wang)';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 400_000;
const MAX_IMAGE_BYTES = 5_000_000;

/** Decode ICO buffers (sharp can't) — returns the largest frame as PNG bytes. */
async function icoToPng(buf: Buffer): Promise<Buffer | null> {
  try {
    const frames = (await decodeIco(buf, 'image/png')) as Array<{
      width: number;
      height: number;
      buffer: ArrayBuffer;
    }>;
    if (!frames.length) return null;
    const best = frames.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    return sharp(Buffer.from(best.buffer)).png().toBuffer();
  } catch {
    return null;
  }
}

/** Run an image buffer through sharp; ICO gets pre-decoded. Throws on failure. */
async function toNormalizedPng(buf: Buffer): Promise<Buffer> {
  let input = buf;
  if (buf.length > 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) {
    const decoded = await icoToPng(buf);
    if (!decoded) throw new Error('ico decode failed');
    input = decoded;
  }
  return sharp(input, { failOn: 'error' })
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function fetchWithCaps(url: string, maxBytes: number, accept: string, userAgent = UA): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': userAgent, Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithCaps(url, MAX_HTML_BYTES, 'text/html,application/xhtml+xml');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new TextDecoder().decode(buf.slice(0, MAX_HTML_BYTES));
  } catch {
    return null;
  }
}

/** Step 1 — Bing search, return top organic result hosts. */
async function searchOfficialDomain(query: string): Promise<string[]> {
  const html = await fetchText(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`,
  );
  if (!html) return [];
  const hosts = new Set<string>();
  const hostRe = /https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/|")/gi;
  let m: RegExpExecArray | null;
  while ((m = hostRe.exec(html))) {
    const h = m[1].toLowerCase();
    // skip search engines / CDNs / social
    if (/(bing|microsoft|msn|zhihu|baidu|douyin|weibo|youtube|facebook|linkedin|wikipedia|wikimedia|github|csdn|juejin|51cto|sohu|163\.com|qq\.com)\./.test(h)) continue;
    if (h.endsWith('.gov.cn') === false && /\.(com|cn|net|org|edu|io|dev|me|co)(\.cn|\.hk)?$/.test(h)) hosts.add(h);
  }
  return Array.from(hosts).slice(0, 5);
}

/** Step 2 — extract icon/logo candidates from an HTML page. */
function extractIconUrls(html: string, base: string): string[] {
  const urls: string[] = [];
  const linkRe = /<link[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    if (!/rel\s*=\s*["'][^"']*(icon|apple-touch)[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) urls.push(href);
  }
  const og = html.match(/<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i)?.[1];
  if (og) urls.push(og);
  urls.push('/favicon.ico');
  return urls
    .map((u) => {
      try {
        return new URL(u, base).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u)
    .slice(0, 6);
}

/** Step 3 — Wikipedia (zh then en) summary thumbnail for orgs without a site icon. */
async function wikipediaThumbnail(name: string): Promise<string | null> {
  for (const lang of ['zh', 'en']) {
    try {
      // Wikimedia policy: identify yourself with a descriptive UA — browser
      // UAs from datacenter IPs get 403.
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`,
        {
          headers: { 'User-Agent': WIKI_UA },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { thumbnail?: { source?: string } };
      if (json.thumbnail?.source) return json.thumbnail.source;
    } catch {
      /* try next lang */
    }
  }
  return null;
}

/**
 * Run the full pipeline. Returns the public path of the normalized PNG
 * (e.g. /uploads/<uuid>.png) or null when every candidate failed.
 */
export async function findAndStoreLogo(opts: {
  name: string;
  domain?: string;
  /** 'company' biases search toward 官网; 'school' adds 大学/University hints. */
  kind: 'company' | 'school';
}): Promise<{ path: string; source: string } | null> {
  const { name, domain, kind } = opts;

  // Build candidate image URL lists, in priority order.
  const candidates: Array<{ url: string; source: string }> = [];

  if (domain) {
    candidates.push({ url: `https://${domain}/favicon.ico`, source: `direct:${domain}` });
    const html = await fetchText(`https://${domain}/`);
    if (html) for (const u of extractIconUrls(html, `https://${domain}/`)) candidates.push({ url: u, source: `direct:${domain}` });
  }

  if (candidates.length < 3) {
    const query =
      kind === 'school' ? `${name} 官网 大学` : `${name} 官网`;
    const hosts = await searchOfficialDomain(query);
    for (const host of hosts.slice(0, 3)) {
      candidates.push({ url: `https://${host}/favicon.ico`, source: `bing:${host}` });
      const html = await fetchText(`https://${host}/`);
      if (html) for (const u of extractIconUrls(html, `https://${host}/`)) candidates.push({ url: u, source: `bing:${host}` });
    }
  }

  const wiki = await wikipediaThumbnail(name);
  if (wiki) candidates.push({ url: wiki, source: 'wikipedia' });

  // Try each candidate: download, verify decodable, normalize, save.
  for (const cand of candidates) {
    try {
      // wikimedia thumbs 403 browser UAs from datacenter IPs — use WIKI_UA there.
      const isWiki = /wikimedia\.org|wikipedia\.org/.test(cand.url);
      const res = await fetchWithCaps(cand.url, MAX_IMAGE_BYTES, 'image/*', isWiki ? WIKI_UA : UA);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.startsWith('image/') && !ct.includes('octet-stream')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) continue;
      const png = await toNormalizedPng(buf);
      const storedName = `${uuidv4()}.png`;
      await fs.mkdir(config.uploadDir, { recursive: true });
      await fs.writeFile(path.join(config.uploadDir, storedName), png);
      return { path: `/uploads/${storedName}`, source: cand.source };
    } catch {
      /* next candidate */
    }
  }
  return null;
}
