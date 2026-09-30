import { useCallback, useEffect, useState } from 'react';

/**
 * UI language (chrome language), deliberately separate from the résumé DATA
 * language (`useResume`). Persisted in localStorage['ui-lang']; defaults from
 * the browser locale. Both switches currently share zh/en, but the two are
 * independent dimensions — e.g. an English recruiter can read the Chinese
 * dossier while keeping the UI in English.
 */

const UI_LANG_KEY = 'ui-lang';

export type UiLang = 'zh' | 'en';

function detectInitialUiLang(): UiLang {
  try {
    const stored = window.localStorage.getItem(UI_LANG_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'zh';
  return nav.startsWith('zh') ? 'zh' : 'en';
}

export function useUiLang(): { uiLang: UiLang; setUiLang: (l: UiLang) => void } {
  const [uiLang, setUiLangState] = useState<UiLang>(detectInitialUiLang);

  // Keep <html lang> roughly in sync for a11y (the résumé hook may refine it).
  useEffect(() => {
    document.documentElement.lang = uiLang === 'zh' ? 'zh-CN' : 'en';
  }, [uiLang]);

  const setUiLang = useCallback((next: UiLang) => {
    setUiLangState(next);
    try {
      window.localStorage.setItem(UI_LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { uiLang, setUiLang };
}
