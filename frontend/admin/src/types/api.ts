/** API response and entity types shared across the admin frontend. */

export type SessionSide = "recruiter" | "admin";

export interface Session {
  id: string;
  side: SessionSide;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | string | null;
  /** Number of messages in the session — 0 means the recruiter never said anything. */
  message_count?: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id: number;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}

export type KnowledgeSourceType = "upload" | "repo" | "manual";

export interface KnowledgeItem {
  id: string;
  filename: string;
  source_type: KnowledgeSourceType;
  created_at: string;
  metadata?: Record<string, unknown> | string | null;
}

export type ProjectStatus = "pending" | "analyzing" | "done" | "error";

export interface Project {
  id: string;
  name: string;
  repo_url?: string | null;
  status: ProjectStatus;
  created_at: string;
  doc?: string | null;
  resume_content?: string | null;
}

export interface Skill {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean | number;
  priority: number;
  created_at: string;
}

/** An uploaded original file (version-managed, downloadable/deletable). */
export interface UploadOriginal {
  id: string;
  stored_name: string;
  original_name: string;
  ext: string;
  size: number;
  created_at: string;
}

export interface UploadResult {
  ok: boolean;
  original_name: string;
  stored_name: string;
  size: number;
  extension: string;
  uploaded_at: string;
}

export interface ResumeEnvelope<T = unknown> {
  lang: string;
  updated_at: string;
  data: T;
}

export interface ProjectDoc {
  doc: string;
  resume_content: unknown;
}

/** Standard error envelope returned by the backend. */
export interface ApiErrorBody {
  error: string;
  [key: string]: unknown;
}
