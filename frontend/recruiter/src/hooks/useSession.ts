import { useCallback, useEffect, useState } from 'react';
import { ensureSession, newId } from '../lib/api';

const STORAGE_KEY = 'job-agent-session-id';

function generateId(): string {
  // Strip the `id_` prefix that newId() adds for message/run ids.
  return newId('s').replace(/^s_/, '');
}

function readStored(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length >= 8 ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage blocked (private mode) — the session simply won't persist */
  }
}

export interface UseSessionResult {
  sessionId: string;
  /** Drop the current session and start a fresh anonymous thread. */
  resetSession: () => string;
  /** True once the id has been registered with the backend. */
  registered: boolean;
}

/**
 * Anonymous session management. No login: the first visit mints a UUID, keeps
 * it in localStorage and reuses it forever after, so conversation history
 * survives a page reload.
 */
export function useSession(): UseSessionResult {
  const [sessionId, setSessionId] = useState<string>(() => readStored() ?? generateId());
  const [registered, setRegistered] = useState(false);

  // Persist whatever id is active (covers the very first visit).
  useEffect(() => {
    const stored = readStored();
    if (stored !== sessionId) writeStored(sessionId);
  }, [sessionId]);

  // Announce the session to the backend so messages can be archived.
  useEffect(() => {
    let cancelled = false;
    setRegistered(false);
    ensureSession(sessionId)
      .then((ok) => {
        if (!cancelled) setRegistered(ok);
      })
      .catch(() => {
        if (!cancelled) setRegistered(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const resetSession = useCallback(() => {
    const next = generateId();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    writeStored(next);
    setSessionId(next);
    return next;
  }, []);

  return { sessionId, resetSession, registered };
}
