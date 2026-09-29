import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export const SKIN_IDS = ["classic", "modern", "emerald"] as const;
export type SkinId = (typeof SKIN_IDS)[number];

const SKIN_KEY = "admin-skin";

function isSkinId(value: unknown): value is SkinId {
  return typeof value === "string" && (SKIN_IDS as readonly string[]).includes(value);
}

function readLocal(): SkinId {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (isSkinId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "classic";
}

function apply(skin: SkinId): void {
  document.documentElement.dataset.skin = skin;
}

/**
 * The admin portal's own skin. Local-first (instant apply on load), then
 * synced with the server so the choice follows the account across devices.
 * Independent from the recruiter portal — visitors pick their own skin.
 */
export function useAdminSkin() {
  const [skin, setSkinState] = useState<SkinId>(readLocal);

  useEffect(() => {
    apply(skin);
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* ignore */
    }
  }, [skin]);

  // Sync from the server once (server wins — it is the cross-device source of
  // truth), unless the fetch fails.
  useEffect(() => {
    let active = true;
    api
      .getUiTheme()
      .then((r) => {
        if (active && isSkinId(r.skin)) setSkinState(r.skin);
      })
      .catch(() => {
        /* offline — keep local */
      });
    return () => {
      active = false;
    };
  }, []);

  const setSkin = useCallback((next: SkinId) => {
    setSkinState(next);
    // Fire-and-forget persist; local state already applied.
    api.setUiTheme(next).catch(() => {
      /* keep local choice on failure */
    });
  }, []);

  return { skin, setSkin };
}
