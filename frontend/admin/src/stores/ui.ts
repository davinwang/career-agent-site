import { create } from "zustand";

export type Theme = "light" | "dark";

const THEME_KEY = "job-agent-admin-theme";
const COLLAPSE_KEY = "job-agent-admin-sidebar";

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

interface UiState {
  theme: Theme;
  /** Desktop sidebar collapsed to icon rail. */
  collapsed: boolean;
  /** Mobile slide-out sidebar open. */
  mobileOpen: boolean;
  toggleTheme: () => void;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  collapsed: initialCollapsed(),
  mobileOpen: false,

  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    set({ theme: next });
  },

  toggleCollapsed: () => {
    const next = !get().collapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ collapsed: next });
  },

  setMobileOpen: (open) => set({ mobileOpen: open }),
}));

// Apply the persisted theme before first paint of any component.
applyTheme(initialTheme());
