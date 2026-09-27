import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'job-agent-theme';

export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialTheme(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  return systemTheme();
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export interface UseThemeResult {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  /** true while the value comes from the OS rather than an explicit choice */
  followingSystem: boolean;
}

/**
 * Dark/light theme, persisted to localStorage and honouring the OS preference
 * on first visit. `index.html` applies the stored value before React mounts so
 * there is no flash of the wrong palette.
 */
export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [followingSystem, setFollowingSystem] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(THEME_KEY) === null;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    apply(theme);
  }, [theme]);

  // Keep following the OS until the user makes an explicit choice.
  useEffect(() => {
    if (!followingSystem || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [followingSystem]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setFollowingSystem(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return { theme, setTheme, toggle, followingSystem };
}
