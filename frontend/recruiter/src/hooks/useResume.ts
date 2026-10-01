import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLanguages, fetchResume } from '../lib/api';
import { SAMPLE_RESUMES } from '../lib/sampleResume';
import type { ResumeData } from '../types/resume';

const LANG_KEY = 'job-agent-lang';
const DEFAULT_LANGS = ['zh', 'en'];

function detectInitialLang(preferred?: string): string {
  if (preferred) return preferred;
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('zh') ? 'zh' : 'en';
}

export interface UseResumeResult {
  data: ResumeData | null;
  loading: boolean;
  error: string | null;
  /** true while rendering the built-in sample because the API was unreachable */
  offline: boolean;
  lang: string;
  setLang: (lang: string) => void;
  languages: string[];
  updatedAt: string | null;
  reload: () => void;
}

/**
 * Loads the résumé for the active language from `GET /api/resume/:lang`.
 *
 * If the backend cannot be reached the hook falls back to a bundled sample
 * dossier and flips `offline` so the UI can disclose it — the page is never a
 * blank screen.
 */
export function useResume(initialLang?: string): UseResumeResult {
  const [lang, setLangState] = useState<string>(() => detectInitialLang(initialLang));
  const [languages, setLanguages] = useState<string[]>(DEFAULT_LANGS);
  const [data, setData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestSeq = useRef(0);

  // Which locales actually exist server-side.
  useEffect(() => {
    let cancelled = false;
    fetchLanguages().then((langs) => {
      if (!cancelled && langs.length) setLanguages(langs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchResume(lang)
      .then((resume) => {
        if (cancelled || seq !== requestSeq.current) return;
        if (!resume.name && !resume.experience.length && !resume.projects.length) {
          throw new Error('empty');
        }
        setData(resume);
        setOffline(false);
        setUpdatedAt(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || seq !== requestSeq.current) return;
        const fallback = SAMPLE_RESUMES[lang] ?? SAMPLE_RESUMES.zh;
        setData(fallback);
        setOffline(true);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, nonce]);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, offline, lang, setLang, languages, updatedAt, reload };
}
