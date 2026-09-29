import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useSkin, SKIN_IDS, type SkinId } from '../hooks/useSkin';
import type { UiStrings } from '../lib/i18n';
import { MoonIcon, SunIcon } from './Icons';

interface Props {
  t: UiStrings;
}

const SKIN_META: Record<SkinId, { zh: string; en: string; swatch: string[] }> = {
  classic: { zh: '经典报纸', en: 'Classic', swatch: ['#e9e2d3', '#b4441c'] },
  modern: { zh: '现代简约', en: 'Modern', swatch: ['#f4f5f8', '#4f46e5'] },
  emerald: { zh: '墨绿典雅', en: 'Emerald', swatch: ['#eceee6', '#1d6b4f'] },
};

/**
 * Appearance button. Click opens a popover where the visitor picks BOTH the
 * light/dark theme and one of three visual skins. All choices are local to
 * the visitor (localStorage) — never pushed from the admin portal.
 */
export function ThemeToggle({ t }: Props) {
  const { theme, setTheme, followingSystem } = useTheme();
  const { skin, setSkin } = useSkin();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dark = theme === 'dark';

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isZh = t.a11y.themeToggle.includes('主题') || t.a11y.themeToggle.includes('外观');

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="icon-btn group"
        aria-label={t.a11y.themeToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t.a11y.themeToggle}
      >
        <span className="relative grid h-[18px] w-[18px] place-items-center">
          <SunIcon
            className="absolute h-[18px] w-[18px] transition-all duration-500"
            style={{
              opacity: dark ? 0 : 1,
              transform: dark ? 'rotate(-90deg) scale(0.4)' : 'rotate(0deg) scale(1)',
            }}
          />
          <MoonIcon
            className="absolute h-[18px] w-[18px] transition-all duration-500"
            style={{
              opacity: dark ? 1 : 0,
              transform: dark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.4)',
            }}
          />
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={t.a11y.themeToggle}
          className="dossier-card absolute right-0 top-[calc(100%+8px)] z-[60] w-56 origin-top-right p-3"
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
        >
          {/* Theme: light / dark */}
          <div className="label mb-1.5 text-[0.58rem]">{isZh ? '主题' : 'Theme'}</div>
          <div className="seg mb-3 grid grid-cols-2 gap-1 p-1" role="radiogroup" aria-label={isZh ? '主题' : 'Theme'}>
            {(['light', 'dark'] as const).map((mode) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(mode)}
                  className="flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[0.72rem] transition-colors"
                  style={{
                    borderColor: active ? 'var(--c-accent, var(--accent))' : 'transparent',
                    background: active ? 'var(--c-accent-soft, var(--accent-soft))' : 'transparent',
                    color: active ? 'var(--c-accent, var(--accent))' : 'inherit',
                  }}
                >
                  {mode === 'light' ? <SunIcon className="h-3.5 w-3.5" /> : <MoonIcon className="h-3.5 w-3.5" />}
                  {mode === 'light' ? t.a11y.lightMode : t.a11y.darkMode}
                </button>
              );
            })}
          </div>

          {/* Skin: three visual styles */}
          <div className="label mb-1.5 text-[0.58rem]">{isZh ? '样式' : 'Style'}</div>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label={isZh ? '样式' : 'Style'}>
            {SKIN_IDS.map((id) => {
              const meta = SKIN_META[id];
              const active = skin === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSkin(id)}
                  className="flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[0.76rem] transition-colors"
                  style={{
                    borderColor: active ? 'var(--c-accent, var(--accent))' : 'var(--c-rule, var(--rule))',
                    background: active ? 'var(--c-accent-soft, var(--accent-soft))' : 'transparent',
                  }}
                >
                  <span className="flex flex-none overflow-hidden rounded-sm border" style={{ borderColor: 'var(--c-rule, var(--rule))' }}>
                    {meta.swatch.map((c) => (
                      <span key={c} style={{ width: 9, height: 18, background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={active ? { color: 'var(--c-accent, var(--accent))' } : undefined}>
                    {isZh ? meta.zh : meta.en}
                  </span>
                  {active && <span className="label flex-none text-[0.55rem]">✓</span>}
                </button>
              );
            })}
          </div>

          {followingSystem && (
            <div className="label mt-2 text-[0.52rem] opacity-70">
              {isZh ? '主题初始跟随系统' : 'Theme initially follows your system'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ThemeToggle;
