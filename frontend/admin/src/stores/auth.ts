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
  /** True when the current session is a read-only guest session. */
  isGuest: boolean;
  /** Hydrate from localStorage on app boot. */
  hydrate: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  guestLogin: () => Promise<boolean>;
  logout: () => void;
}

function usernameFrom(token: string | null): string | null {
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.username ?? null;
}

function roleFrom(token: string | null): "admin" | "guest" | null {
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.role === "guest" ? "guest" : "admin";
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  username: null,
  isAuthenticated: false,
  isGuest: false,

  hydrate: () => {
    const existing = getToken();
    if (isTokenValid(existing)) {
      const role = roleFrom(existing);
      set({
        token: existing,
        username: usernameFrom(existing),
        isAuthenticated: true,
        isGuest: role === "guest",
      });
    } else if (existing) {
      clearToken();
      set({ token: null, username: null, isAuthenticated: false, isGuest: false });
    }
  },

  login: async (username, password) => {
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      set({ token, username: usernameFrom(token) ?? username, isAuthenticated: true, isGuest: false });
      return true;
    } catch {
      return false;
    }
  },

  guestLogin: async () => {
    try {
      const { token } = await api.guestLogin();
      setToken(token);
      set({ token, username: "guest", isAuthenticated: true, isGuest: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    clearToken();
    set({ token: null, username: null, isAuthenticated: false, isGuest: false });
  },
}));
