import type {
  Session,
  Message,
  KnowledgeItem,
  Project,
  Skill,
  UploadResult,
  UploadOriginal,
  ResumeEnvelope,
  ProjectDoc,
} from "../types/api";
import type { ResumeData } from "../types/resume";
import { t as i18nT } from "./i18n";

/** A GitHub repo as returned by the official /user/repos endpoint. */
export interface RepoInfo {
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  language: string | null;
  pushed_at: string | null;
  default_branch?: string;
}

/** Base URL — empty in dev (Vite proxies /api & /ag-ui) or configurable. */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const TOKEN_KEY = "job-agent-admin-token";
const UNAUTHORIZED_EVENT = "job-agent:unauthorized";

/* ---------------------------- token helpers ---------------------------- */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Decode a JWT payload without verifying (expiry check only). */
export function decodeToken(token: string): { exp?: number; username?: string; role?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { exp?: number; username?: string; role?: string };
  } catch {
    return null;
  }
}

/** True when a token exists and its `exp` claim is in the future. */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeToken(token);
  if (!payload) return false;
  if (typeof payload.exp !== "number") return true; // no expiry claim -> assume valid
  return payload.exp * 1000 > Date.now();
}

/* ------------------------------ errors -------------------------------- */

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function onUnauthorized(): void {
  clearToken();
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

/* ------------------------------ request ------------------------------- */

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | null;
  /** Skip the JSON parse (e.g. blob downloads). */
  raw?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { raw, headers, ...rest } = opts;
  const token = getToken();
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  if (rest.body && !(rest.body instanceof FormData) && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError(i18nT("api.networkDown"), 0);
  }

  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(i18nT("api.sessionExpired"), 401);
  }

  if (!res.ok) {
    let message = i18nT("api.requestFailed", res.status);
    let detail: unknown;
    try {
      detail = await res.json();
      if (detail && typeof detail === "object" && "error" in detail) {
        message = String((detail as { error: unknown }).error);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, detail);
  }

  if (raw) return (await res.blob()) as unknown as T;
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

const json = (o: Record<string, unknown>): string => JSON.stringify(o);

/* ------------------------------- api ---------------------------------- */

const api = {
  // Auth
  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: json({ username, password }),
    });
  },
  /** Whether the backend has guest mode enabled (public probe). */
  guestStatus(): Promise<{ enabled: boolean }> {
    return fetch(`${API_BASE}/api/auth/guest-status`).then((r) => r.json());
  },
  /** Obtain a read-only guest token (only works when guest mode is enabled). */
  guestLogin(): Promise<{ token: string; username: string; guest: boolean }> {
    return fetch(`${API_BASE}/api/auth/guest`, { method: "POST" }).then(async (r) => {
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new ApiError(
          detail && typeof detail === "object" && "error" in detail
            ? String((detail as { error: unknown }).error)
            : `Guest login failed (${r.status})`,
          r.status,
        );
      }
      return r.json();
    });
  },
  me(): Promise<{ username: string }> {
    return request("/api/auth/me");
  },

  // Resume
  getResume(lang: string): Promise<ResumeEnvelope<ResumeData>> {
    return request(`/api/resume/${encodeURIComponent(lang)}`);
  },
  updateResume(lang: string, data: ResumeData): Promise<{ ok: boolean }> {
    return request(`/api/resume/${encodeURIComponent(lang)}`, {
      method: "PUT",
      body: json({ data }),
    });
  },
  getLanguages(): Promise<{ languages: string[] }> {
    return request("/api/resume/languages");
  },
  downloadPdf(lang: string): Promise<Blob> {
    return request<Blob>(`/api/resume/pdf?lang=${encodeURIComponent(lang)}`, { raw: true });
  },

  // Sessions
  getCurrentSession(): Promise<{ session: { id: string; side: string; updated_at: string } }> {
    return request(`/api/sessions/current?side=admin`);
  },
  /** Start a new admin chat — the fresh session becomes the current one. */
  newCurrentSession(): Promise<{ session: { id: string; side: string; updated_at: string } }> {
    return request(`/api/sessions/current?side=admin`, { method: "POST" });
  },
  /** Own admin sessions, newest first (for the in-chat session switcher). */
  listAdminSessions(): Promise<{ sessions: Array<{ id: string; side: string; created_at: string; updated_at: string; metadata: string | null }> }> {
    return request(`/api/sessions?side=admin`);
  },

  listSessions(side?: "recruiter" | "admin"): Promise<{ sessions: Session[] }> {
    const q = side ? `?side=${side}` : "";
    return request(`/api/sessions${q}`);
  },
  getSessionMessages(sessionId: string): Promise<{ messages: Message[] }> {
    return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  },
  createSession(id: string, side: "recruiter" | "admin"): Promise<Session> {
    return request("/api/sessions", { method: "POST", body: json({ id, side }) });
  },

  // Upload
  listUploads(): Promise<{ uploads: UploadOriginal[] }> {
    return request("/api/upload");
  },
  async downloadUpload(storedName: string, originalName: string): Promise<void> {
    const blob = await request<Blob>(
      `/api/upload/${encodeURIComponent(storedName)}`,
      { raw: true },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = originalName;
    a.click();
    URL.revokeObjectURL(url);
  },
  deleteUpload(storedName: string): Promise<void> {
    return request(`/api/upload/${encodeURIComponent(storedName)}`, { method: "DELETE" });
  },
  uploadFile(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<UploadResult> {
    // Use XHR to expose upload progress; falls back gracefully.
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/upload`);
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          onUnauthorized();
          reject(new ApiError(i18nT("api.sessionExpired"), 401));
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as UploadResult);
        } else {
          const msg =
            parsed && typeof parsed === "object" && "error" in parsed
              ? String((parsed as { error: unknown }).error)
              : i18nT("api.uploadFailed", xhr.status);
          reject(new ApiError(msg, xhr.status, parsed));
        }
      };
      xhr.onerror = () => reject(new ApiError(i18nT("api.uploadNetworkError"), 0));
      xhr.send(form);
    });
  },

  // Knowledge
  listKnowledge(): Promise<{ knowledge: KnowledgeItem[] }> {
    return request("/api/knowledge");
  },
  deleteKnowledge(id: string): Promise<void> {
    return request(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  // Projects
  listProjects(): Promise<{ projects: Project[] }> {
    return request("/api/projects");
  },
  addRepo(url: string, name?: string): Promise<Project> {
    return request("/api/projects", { method: "POST", body: json({ repo_url: url, name }) });
  },
  analyzeProject(id: string): Promise<void> {
    return request(`/api/projects/${encodeURIComponent(id)}/analyze`, { method: "POST" });
  },
  getProjectDoc(id: string): Promise<ProjectDoc> {
    return request(`/api/projects/${encodeURIComponent(id)}/doc`);
  },

  // Skills
  listSkills(): Promise<{ skills: Skill[] }> {
    return request("/api/skills");
  },
  createSkill(name: string, prompt: string, priority = 0): Promise<Skill> {
    return request("/api/skills", { method: "POST", body: json({ name, prompt, priority }) });
  },
  updateSkill(id: string, data: Partial<Skill>): Promise<void> {
    return request(`/api/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: json(data),
    });
  },
  deleteSkill(id: string): Promise<void> {
    return request(`/api/skills/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  // Settings
  getUiTheme(): Promise<{ skin: "classic" | "modern" | "emerald" }> {
    return request("/api/settings/ui-theme");
  },
  setUiTheme(skin: "classic" | "modern" | "emerald"): Promise<{ ok: boolean; skin: string }> {
    return request("/api/settings/ui-theme", {
      method: "PUT",
      body: json({ skin }),
    });
  },

  // Artifacts (chat-page nine-grid aggregate)
  getArtifacts(): Promise<unknown> {
    return request("/api/artifacts");
  },

  // GitHub credential hosting / OAuth binding
  getGithubStatus(): Promise<{
    pat: boolean;
    oauth: { bound: boolean; login: string | null };
    source: "pat" | "oauth" | null;
    user: string | null;
  }> {
    return request("/api/settings/github");
  },
  saveGithubPat(pat: string): Promise<{ ok: boolean; login: string }> {
    return request("/api/settings/github", { method: "PUT", body: json({ pat }) });
  },
  removeGithubCreds(): Promise<void> {
    return request("/api/settings/github", { method: "DELETE" });
  },
  listGithubRepos(): Promise<{ repos: RepoInfo[]; source: string }> {
    return request("/api/settings/github/repos");
  },
  githubOauthStart(): Promise<{ url: string; state: string; redirect: string }> {
    return request(`/api/auth/github/login?redirect=${encodeURIComponent(window.location.origin + "/admin/github-callback")}`);
  },
  unbindGithubOauth(): Promise<void> {
    return request("/api/auth/github/unbind", { method: "DELETE" });
  },
};

export { api, UNAUTHORIZED_EVENT };
