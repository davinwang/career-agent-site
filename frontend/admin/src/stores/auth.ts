import { create } from "zustand";
import {
  api,
  getToken,
  setToken,
  clearToken,
  isTokenValid,
  decodeToken,
} from "../lib/api";

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  /** Hydrate from localStorage on app boot. */
  hydrate: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

function usernameFrom(token: string | null): string | null {
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.username ?? null;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  username: null,
  isAuthenticated: false,

  hydrate: () => {
    const existing = getToken();
    if (isTokenValid(existing)) {
      set({ token: existing, username: usernameFrom(existing), isAuthenticated: true });
    } else if (existing) {
      clearToken();
      set({ token: null, username: null, isAuthenticated: false });
    }
  },

  login: async (username, password) => {
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      set({ token, username: usernameFrom(token) ?? username, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    clearToken();
    set({ token: null, username: null, isAuthenticated: false });
  },
}));
