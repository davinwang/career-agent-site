/**
 * Canonical résumé shape consumed by the UI.
 *
 * The backend stores one JSON blob per language and the two locales do not use
 * identical keys (the English export uses `title`/`meta`/`points`, the Chinese
 * one uses `company`/`role`/`period`/`highlights`). `normalizeResume()` in
 * `lib/api.ts` folds both into the shape declared here, so every component can
 * rely on a single contract.
 */

export interface ResumeExperience {
  company: string;
  role: string;
  period: string;
  /** Day-to-day responsibilities ("工作内容"), e.g. backend field `desc`. */
  duties: string[];
  /** Measurable outcomes ("工作成果"), e.g. backend field `achievements`. */
  highlights: string[];
  tech?: string;
  logo?: string;
}

export interface ResumeProject {
  name: string;
  role: string;
  period: string;
  content: string[];
  highlights: string[];
  demo_link?: string;
  repo_link?: string;
  open_source: boolean;
}

export interface ResumeEducation {
  school: string;
  degree: string;
  field: string;
  period: string;
  logo?: string;
}

export interface ResumeData {
  name: string;
  status: string;
  tags: string[];
  summary: string;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  /** category label -> skill chips */
  skills: Record<string, string[]>;
  education: ResumeEducation[];
  /** optional public photo URL (e.g. /uploads/xxx.png) */
  photo?: string;
}

/** Payload returned by `GET /api/resume/:lang`. */
export interface ResumeEnvelope {
  lang: string;
  updated_at: string;
  data: ResumeData;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** local-only flags */
  streaming?: boolean;
  error?: boolean;
  createdAt?: string;
}

/** Row shape returned by `GET /api/sessions/:id/messages`. */
export interface StoredMessage {
  id: number;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

export type SupportedLang = 'zh' | 'en' | (string & {});

export const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
};
