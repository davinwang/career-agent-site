import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
 * Segmented 中文 / EN switch with a sliding thumb. The thumb is measured from
 * the real button boxes so it stays correct for any language list.
 */
export function LanguageSwitch({ languages, value, onChange, t }: Props) {
  const isCompact = !useMediaQuery('(min-width: 640px)');
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumb, setThumb] = useState({ left: 2, width: 0 });

  const items = languages.length ? languages : ['zh', 'en'];

  const measure = () => {
    const wrap = wrapRef.current;
    const active = btnRefs.current[items.indexOf(value)];
    if (!wrap || !active) return;
    const wrapBox = wrap.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    setThumb({ left: box.left - wrapBox.left, width: box.width });
  };

  useLayoutEffect(measure, [items.join('|'), value, isCompact]);

  useEffect(() => {
    if (typeof document.fonts?.ready?.then === 'function') {
      document.fonts.ready.then(measure).catch(() => undefined);
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      className="seg"
      role="group"
      aria-label={t.a11y.language}
    >
      <span
        className="seg__thumb"
        aria-hidden
        style={{ left: thumb.left, width: thumb.width }}
      />
      {items.map((lang, i) => (
        <button
          key={lang}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
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
