import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'job-agent-theme';

/** The persisted choice — "system" follows the OS. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** The actually-applied palette (never "system"). */
export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    /* ignore */
  }
  return 'system';
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export interface UseThemeResult {
  /** Resolved palette currently applied. */
  theme: Theme;
  /** The stored choice ('system' by default). */
  themeChoice: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  toggle: () => void;
  /** true while the value comes from the OS rather than an explicit choice */
  followingSystem: boolean;
}

/**
 * Dark/light/system theme, persisted to localStorage. Defaults to "system":
 * follows the OS preference live until the user makes an explicit choice.
 * `index.html` applies the stored value before React mounts so there is no
 * flash of the wrong palette.
 */
export function useTheme(): UseThemeResult {
  const [themeChoice, setChoice] = useState<ThemeChoice>(initialChoice);
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  useEffect(() => {
    const resolved = themeChoice === 'system' ? systemTheme() : themeChoice;
    setThemeState(resolved);
    apply(resolved);
  }, [themeChoice]);

  // While on "system", track OS changes live.
  useEffect(() => {
    if (themeChoice !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      setThemeState(next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeChoice]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(themeChoice === 'system' ? (systemTheme() === 'dark' ? 'light' : 'dark') : themeChoice === 'dark' ? 'light' : 'dark');
  }, [setTheme, themeChoice]);

  return { theme, themeChoice, setTheme, toggle, followingSystem: themeChoice === 'system' };
}
