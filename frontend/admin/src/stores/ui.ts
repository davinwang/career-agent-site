import { create } from "zustand";

/** "system" follows the OS preference; light/dark are explicit choices. */
export type ThemeChoice = "light" | "dark" | "system";
/** The actually-applied palette (never "system"). */
export type Theme = "light" | "dark";

const THEME_KEY = "job-agent-admin-theme";
const COLLAPSE_KEY = "job-agent-admin-sidebar";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  return "system"; // default: follow the OS
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
  /** The user's choice — "system" by default. */
  themeChoice: ThemeChoice;
  /** The palette currently applied (resolved from choice + OS). */
  theme: Theme;
  /** Desktop sidebar collapsed to icon rail. */
  collapsed: boolean;
  /** Mobile slide-out sidebar open. */
  mobileOpen: boolean;
  setThemeChoice: (choice: ThemeChoice) => void;
  toggleTheme: () => void;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
}

function resolved(choice: ThemeChoice): Theme {
  return choice === "system" ? systemTheme() : choice;
}

let mediaSubscribed = false;
/** While on "system", track OS changes live. */
function ensureSystemListener(getState: () => UiState, setState: (partial: Partial<UiState>) => void): void {
  if (mediaSubscribed || !window.matchMedia) return;
  mediaSubscribed = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    const { themeChoice } = getState();
    if (themeChoice === "system") {
      const next = systemTheme();
      applyTheme(next);
      setState({ theme: next });
    }
  });
}

export const useUi = create<UiState>((set, get) => {
  ensureSystemListener(get, (p) => set(p));
  const choice = initialChoice();
  const theme = resolved(choice);
  applyTheme(theme);

  return {
    themeChoice: choice,
    theme,
    collapsed: initialCollapsed(),
    mobileOpen: false,

    setThemeChoice: (next) => {
      const theme = resolved(next);
      applyTheme(theme);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      set({ themeChoice: next, theme });
    },

    toggleTheme: () => {
      // Cycle: system -> light -> dark -> system
      const order: ThemeChoice[] = ["system", "light", "dark"];
      const next = order[(order.indexOf(get().themeChoice) + 1) % order.length];
      get().setThemeChoice(next);
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
  };
});
