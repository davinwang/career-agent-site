import type { ResumeData } from '../types/resume';

/**
 * Offline / placeholder dossier.
 *
 * Used when `GET /api/resume/:lang` fails or the database has no resume for
 * the requested language. MUST stay anonymous: no real name, employer,
 * school, project or metric may appear here — the bundle is shipped to every
 * visitor's browser and is trivially readable via view-source. Real data
 * lives only behind the API.
 */

function placeholder(lang: string): ResumeData {
  const isZh = lang === 'zh';
  const t = (zh: string, en: string) => (isZh ? zh : en);
  return {
    name: t('候选人', 'Candidate'),
    status: t('档案待发布', 'Dossier pending publication'),
    tags: [],
    summary: t(
      '候选人简历尚未发布，请稍后再试。',
      'The candidate dossier has not been published yet. Please check back later.',
    ),
    experience: [],
    projects: [],
    skills: {},
    education: [],
  };
}

export const SAMPLE_RESUMES: Record<string, ResumeData> = {
  zh: placeholder('zh'),
  en: placeholder('en'),
};
