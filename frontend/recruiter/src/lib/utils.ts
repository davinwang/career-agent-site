import type { CSSProperties } from 'react';

/** Join class names, dropping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * React's `CSSProperties` has no index signature, so custom properties need a
 * cast. This keeps the call-sites readable: `style={vars({ '--i': 2 })}`.
 */
export function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

/** `2026-09-27T08:00:00.000Z` -> `08:00` (local). Empty string on failure. */
export function clockTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
