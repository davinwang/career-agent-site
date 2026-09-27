import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { UiStrings } from '../lib/i18n';
import { LANG_LABELS } from '../types/resume';

interface Props {
  languages: string[];
  value: string;
  onChange: (lang: string) => void;
  t: UiStrings;
}

function labelFor(lang: string): string {
  return LANG_LABELS[lang] ?? lang.toUpperCase();
}

/**
 * Segmented 中文 / EN switch with a sliding thumb. The thumb is measured from
 * the real button boxes so it stays correct for any language list.
 */
export function LanguageSwitch({ languages, value, onChange, t }: Props) {
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

  useLayoutEffect(measure, [items.join('|'), value]);

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
          {labelFor(lang)}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitch;
