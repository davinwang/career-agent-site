/**
 * Resume data model — mirrors the JSON blob stored in the `resume` table.
 * All fields are optional so partial / in-progress resumes render gracefully.
 */

export interface ExperienceItem {
  company?: string;
  role?: string;
  period?: string;
  highlights?: string[];
  logo?: string;
}

export interface ProjectItem {
  name?: string;
  role?: string;
  period?: string;
  content?: string[];
  highlights?: string[];
  demo_link?: string;
  repo_link?: string;
  open_source?: boolean;
}

export interface EducationItem {
  school?: string;
  degree?: string;
  field?: string;
  period?: string;
  logo?: string;
}

/** skills is a map of category -> list of skill strings. */
export type SkillsMap = Record<string, string[]>;

export interface ResumeData {
  name?: string;
  status?: string;
  tags?: string[];
  summary?: string;
  experience?: ExperienceItem[];
  projects?: ProjectItem[];
  skills?: SkillsMap;
  education?: EducationItem[];
  [key: string]: unknown;
}
