import type { CSSProperties } from 'react';
import type { UiStrings } from '../lib/i18n';
import { LANG_LABELS, LANG_LABELS_SHORT } from '../types/resume';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface Props {
  languages: string[];
  value: string;
  onChange: (lang: string) => void;
  t: UiStrings;
}

/**
 * Full label on desktop, compact single-glyph labels on mobile to save
 * header space (中文→中, English→EN).
 */
function labelFor(lang: string, compact: boolean): string {
  const dict = compact ? LANG_LABELS_SHORT : LANG_LABELS;
  return dict[lang] ?? lang.toUpperCase();
}

/**
 * Segmented 中文 / EN switch with a sliding thumb. The thumb is positioned
 * purely in CSS from two custom properties (item count + active index) on an
 * equal-width grid — no JS measurement, so it can never drift out of sync
 * with the pressed state (font loading, resize, etc.).
 */
export function LanguageSwitch({ languages, value, onChange, t }: Props) {
  const isCompact = !useMediaQuery('(min-width: 640px)');
  const items = languages.length ? languages : ['zh', 'en'];
  const activeIndex = Math.max(0, items.indexOf(value));

  return (
    <div
      className="seg"
      role="group"
      aria-label={t.a11y.language}
      style={
        {
          '--seg-count': items.length,
          '--seg-index': activeIndex,
        } as CSSProperties
      }
    >
      <span className="seg__thumb" aria-hidden />
      {items.map((lang) => (
        <button
          key={lang}
          type="button"
          className="seg__btn"
          aria-pressed={value === lang}
          onClick={() => onChange(lang)}
        >
          {labelFor(lang, isCompact)}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitch;
