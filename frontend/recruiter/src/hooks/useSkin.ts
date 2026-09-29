import { useCallback, useEffect, useState } from 'react';

export const SKIN_IDS = ['classic', 'modern', 'emerald'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

const SKIN_KEY = 'recruiter-skin';

function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}

function readLocal(): SkinId {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (isSkinId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'classic';
}

/**
 * Visitor-chosen UI skin, applied as `data-skin` on <html> and persisted in
 * localStorage. Fully client-side: the candidate's admin choice no longer
 * controls this portal.
 */
export function useSkin() {
  const [skin, setSkinState] = useState<SkinId>(readLocal);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* storage blocked — skin just won't persist */
    }
  }, [skin]);

  const setSkin = useCallback((next: SkinId) => setSkinState(next), []);

  return { skin, setSkin };
}
