import type {
  ChatMessage,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeVerification,
  StoredMessage,
} from '../types/resume';

/**
 * Relative by design: the Vite dev-server proxies `/api` + `/ag-ui` to the
 * Hono backend, nginx does the same in production. `VITE_API_URL` only exists
 * as an escape hatch for cross-origin demos.
 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const RECRUITER_AGENT_PATH = '/ag-ui/recruiter';
const SESSION_ID_HEADER = 'X-Session-Id';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* low-level helpers                                                          */
/* -------------------------------------------------------------------------- */

async function readJson<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body — handled below */
  }
  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status);
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/* -------------------------------------------------------------------------- */
/* résumé normalisation                                                       */
/* -------------------------------------------------------------------------- */

const DATE_HINT = /\d{4}/;
const SEPARATOR = /\s*[·|]\s*/;

/**
 * The English export encodes `Company · Role` inside a single `title` field and
 * packs role + tech + period into `meta`. Split them back out so the renderer
 * only ever deals with discrete fields.
 */
function splitLabel(raw: string): [string, string] {
  const parts = raw.split(SEPARATOR).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [raw.trim(), ''];
  if (parts.length === 1) return [parts[0], ''];
  const last = parts[parts.length - 1];
  if (DATE_HINT.test(last)) return [parts.slice(0, -1).join(' · '), last];
  return [parts[0], parts.slice(1).join(' · ')];
}

function splitMetaPeriod(meta: string): { role: string; period: string } {
  const parts = meta.split(SEPARATOR).map((p) => p.trim()).filter(Boolean);
  const dateIdx = parts.findIndex((p) => DATE_HINT.test(p));
  if (dateIdx === -1) return { role: meta.trim(), period: '' };
  return {
    role: parts.slice(0, dateIdx).join(' · ').trim(),
    period: parts.slice(dateIdx).join(' · ').trim(),
  };
}

function normalizeExperience(items: unknown): ResumeExperience[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw): ResumeExperience | null => {
    if (!isRecord(raw)) return null;
    const title = str(raw.title);
    const meta = str(raw.meta);
    const [titleCompany, titleRole] = splitLabel(title);
    const metaSplit = splitMetaPeriod(meta);

    const company = str(raw.company) || titleCompany;
    const role = str(raw.role) || str(raw.position) || titleRole || metaSplit.role;
    const period = str(raw.period) || (meta ? metaSplit.period : '') || meta;

    // Backend stores responsibilities in `desc` (string) and outcomes in
    // `achievements` ([]); fall back to legacy `duties`/`highlights`/`points`.
    const duties = [
      ...strArray(raw.duties),
      ...strArray(raw.responsibilities),
    ];
    if (duties.length === 0 && str(raw.desc)) duties.push(str(raw.desc));

    const highlights = strArray(raw.achievements).length
      ? strArray(raw.achievements)
      : strArray(raw.highlights).length
        ? strArray(raw.highlights)
        : strArray(raw.points);

    return {
      company,
      role,
      period,
      duties,
      highlights,
      tech: str(raw.tech) || undefined,
      logo: str(raw.logo) || undefined,
    } satisfies ResumeExperience;
  }).filter((v): v is ResumeExperience => v !== null && (v.company !== '' || v.role !== ''));
}

function normalizeProjects(items: unknown): ResumeProject[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw): ResumeProject | null => {
    if (!isRecord(raw)) return null;
    const title = str(raw.title);
    const meta = str(raw.meta);
    const metaSplit = splitMetaPeriod(meta);

    const name = str(raw.name) || title;
    const role = str(raw.role) || (meta ? metaSplit.role : '');
    const period = str(raw.period) || (meta ? metaSplit.period : '');

    return {
      name,
      role,
      period,
      content: strArray(raw.content).length ? strArray(raw.content) : strArray(raw.points),
      highlights: strArray(raw.highlights),
      demo_link: str(raw.demo_link) || undefined,
      repo_link: str(raw.repo_link) || undefined,
      open_source: raw.open_source === true,
    } satisfies ResumeProject;
  }).filter((v): v is ResumeProject => v !== null && v.name !== '');
}

function normalizeVerification(items: unknown): ResumeVerification[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const list = items
    .map((raw): ResumeVerification | null => {
      if (!isRecord(raw)) return null;
      const url = str(raw.url);
      if (!/^https?:\/\//.test(url)) return null;
      return {
        label: str(raw.label) || '官方验证',
        url,
        code: str(raw.code) || undefined,
      };
    })
    .filter((v): v is ResumeVerification => v !== null);
  return list.length ? list : undefined;
}

function normalizeEducation(items: unknown): ResumeEducation[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw): ResumeEducation | null => {
    if (!isRecord(raw)) return null;
    return {
      school: str(raw.school),
      degree: str(raw.degree),
      field: str(raw.field) || str(raw.major),
      period: str(raw.period) || str(raw.meta),
      logo: str(raw.logo) || undefined,
      verification: normalizeVerification(raw.verification),
    } satisfies ResumeEducation;
  }).filter((v): v is ResumeEducation => v !== null && (v.school !== '' || v.degree !== ''));
}

/**
 * `skills` arrives either as `{ category: [items] }` (zh) or as a flat
 * `["Category: a, b, c"]` list (en). Fold both into a record.
 */
function normalizeSkills(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      if (typeof entry !== 'string') return;
      const colon = entry.search(/[:：]/);
      if (colon > 0 && colon < 60) {
        const key = entry.slice(0, colon).trim();
        const values = entry
          .slice(colon + 1)
          .split(/[,，;；]/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (key) out[key] = values;
      } else {
        out[`#${String(index + 1).padStart(2, '0')}`] = [entry.trim()];
      }
    });
    return out;
  }

  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        const items = value.filter((v): v is string => typeof v === 'string');
        if (items.length) out[key] = items;
      } else if (typeof value === 'string' && value.trim()) {
        out[key] = value
          .split(/[,，;；]/)
          .map((v) => v.trim())
          .filter(Boolean);
      }
    }
  }

  return out;
}

/** Fold any stored résumé blob into the canonical `ResumeData` contract. */
export function normalizeResume(raw: unknown): ResumeData {
  const src = isRecord(raw) ? raw : {};
  return {
    name: str(src.name),
    status: str(src.status) || str(src.headline),
    tags: strArray(src.tags),
    summary: str(src.summary) || str(src.about),
    experience: normalizeExperience(src.experience),
    projects: normalizeProjects(src.projects),
    skills: normalizeSkills(src.skills),
    education: normalizeEducation(src.education),
    photo: str(src.photo) || undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* REST                                                                       */
/* -------------------------------------------------------------------------- */

/** `GET /api/resume/:lang` */
export async function fetchResume(lang: string): Promise<ResumeData> {
  const res = await fetch(`${API_BASE}/api/resume/${encodeURIComponent(lang)}`, {
    headers: { Accept: 'application/json' },
  });
  const payload = await readJson<{ lang?: string; data?: unknown }>(res);
  // Some deployments return the résumé object directly instead of wrapped.
  const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  return normalizeResume(data);
}

/** `GET /api/resume/languages` — falls back to `['zh','en']` when unavailable. */
export async function fetchLanguages(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/resume/languages`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await readJson<{ languages?: unknown }>(res);
    const langs = strArray(payload?.languages);
    return langs.length ? langs : ['zh', 'en'];
  } catch {
    return ['zh', 'en'];
  }
}

/** One recruiter-facing question generated during project analysis (bilingual). */
export interface RecruiterQuestion {
  question_zh: string;
  question_en: string;
  /** true = answering needs candidate-supplied material → prefill, don't send. */
  needs_input: boolean;
}

/**
 * `GET /api/projects/questions` — per-project recruiter questions produced by
 * the admin agent's source-code analysis. Best-effort: any failure yields {}.
 */
export async function fetchProjectQuestions(): Promise<Record<string, RecruiterQuestion[]>> {
  try {
    const res = await fetch(`${API_BASE}/api/projects/questions`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return {};
    const payload = await readJson<{ questions?: Record<string, RecruiterQuestion[]> }>(res);
    return payload.questions ?? {};
  } catch {
    return {};
  }
}

/**
 * Register the anonymous session so message history can be persisted.
 * A 409 just means "already known" and is not an error.
 */
export async function ensureSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_ID_HEADER]: sessionId,
      },
      body: JSON.stringify({ id: sessionId, side: 'recruiter' }),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

/** `GET /api/sessions/:id/messages` */
export async function fetchSessionMessages(sessionId: string): Promise<StoredMessage[]> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    { headers: { Accept: 'application/json', [SESSION_ID_HEADER]: sessionId } },
  );
  if (res.status === 404) return [];
  const payload = await readJson<{ messages?: StoredMessage[] }>(res);
  return Array.isArray(payload?.messages) ? payload.messages : [];
}

/**
 * `POST /ag-ui/recruiter` — returns the **raw** Response so the caller can walk
 * the SSE byte stream. Body follows the AG-UI `RunAgentInput` shape.
 */
export function sendChatMessage(
  sessionId: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<Response> {
  const runId = newId('run');
  const wire = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ id: m.id, role: m.role, content: m.content }));

  return fetch(`${API_BASE}${RECRUITER_AGENT_PATH}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      [SESSION_ID_HEADER]: sessionId,
    },
    body: JSON.stringify({
      threadId: sessionId,
      runId,
      messages: wire,
      state: {},
      tools: [],
      context: [],
      forwardedProps: { side: 'recruiter' },
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* SSE parsing                                                                */
/* -------------------------------------------------------------------------- */

export type SseEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'MESSAGES_SNAPSHOT'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'STATE_DELTA'
  | 'CUSTOM'
  | 'RAW';

export interface SseEvent {
  type: SseEventType | string;
  /** raw parsed JSON payload (may be undefined for comment/heartbeat lines) */
  payload: Record<string, unknown>;
  /** SSE `event:` field when present */
  event?: string;
}

const TYPE_ALIASES: Record<string, SseEventType> = {
  text_message_content: 'TEXT_MESSAGE_CONTENT',
  textmessagecontent: 'TEXT_MESSAGE_CONTENT',
  text_message_start: 'TEXT_MESSAGE_START',
  text_message_end: 'TEXT_MESSAGE_END',
  run_started: 'RUN_STARTED',
  run_finished: 'RUN_FINISHED',
  run_error: 'RUN_ERROR',
  messages_snapshot: 'MESSAGES_SNAPSHOT',
};

function canonicalType(value: unknown, fallbackEvent?: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : (fallbackEvent ?? '');
  const upper = raw.toUpperCase();
  const flat = upper.replace(/[\s.-]/g, '_');
  return TYPE_ALIASES[raw.toLowerCase().replace(/[\s.-]/g, '')] ?? TYPE_ALIASES[flat.toLowerCase()] ?? flat;
}

/**
 * Incremental SSE frame parser. Feed it raw chunks; it calls back once per
 * complete event. Tolerates `\r\n`, missing `event:` fields, `data:` split
 * across several lines, and non-JSON payloads.
 */
export function createSseParser(onEvent: (evt: SseEvent) => void) {
  let buffer = '';

  const flushFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    let eventName: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue; // comment / heartbeat
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') eventName = value;
      else if (field === 'data') dataLines.push(value);
    }

    if (!dataLines.length && !eventName) return;
    const joined = dataLines.join('\n');
    if (joined.trim() === '[DONE]') {
      onEvent({ type: 'RUN_FINISHED', payload: {}, event: eventName });
      return;
    }

    let payload: Record<string, unknown> = {};
    if (joined) {
      try {
        const parsed: unknown = JSON.parse(joined);
        payload = isRecord(parsed) ? parsed : { value: parsed };
      } catch {
        payload = { delta: joined };
        onEvent({ type: canonicalType(undefined, eventName) || 'RAW', payload, event: eventName });
        return;
      }
    }
    onEvent({ type: canonicalType(payload.type, eventName), payload, event: eventName });
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const match = /\r?\n\r?\n/.exec(buffer.slice(boundary))!;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + match[0].length);
        flushFrame(frame);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    },
    end() {
      if (buffer.trim()) flushFrame(buffer);
      buffer = '';
    },
  };
}

/** Consume a streaming `Response`, decoding chunks as UTF-8 text. */
export async function streamResponse(
  res: Response,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!res.body) {
    onChunk(await res.text());
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) onChunk(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } finally {
    reader.releaseLock();
  }
}

/* -------------------------------------------------------------------------- */
/* ids / misc                                                                 */
/* -------------------------------------------------------------------------- */

export function newId(prefix = 'id'): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`;
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
