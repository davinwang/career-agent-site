import { useEffect, useState } from 'react';

export const SKIN_IDS = ['classic', 'modern', 'emerald'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export const DEFAULT_SKIN: SkinId = 'classic';

function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}

/**
 * Fetch the candidate-chosen UI skin and apply it as `data-skin` on <html>.
 * Public endpoint, fails soft to 'classic'. Applied before resume fetch so the
 * first paint already carries the right palette.
 */
export function useSkin(): SkinId {
  const [skin, setSkin] = useState<SkinId>(() => {
    try {
      const cached = localStorage.getItem('recruiter-skin');
      return isSkinId(cached) ? cached : DEFAULT_SKIN;
    } catch {
      return DEFAULT_SKIN;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      localStorage.setItem('recruiter-skin', skin);
    } catch {
      /* ignore */
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/settings/ui-theme');
        if (!res.ok) return;
        const payload = (await res.json()) as { skin?: unknown };
        if (!active || !isSkinId(payload.skin)) return;
        setSkin(payload.skin);
        document.documentElement.dataset.skin = payload.skin;
      } catch {
        /* offline — keep cached/default skin */
      }
    })();
    return () => {
      active = false;
    };
  }, [skin]);

  return skin;
}
