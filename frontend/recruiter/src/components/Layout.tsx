import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { UiStrings } from '../lib/i18n';
import { cx } from '../lib/utils';
import { ChatIcon } from './Icons';
import LanguageSwitch from './LanguageSwitch';
import ThemeToggle from './ThemeToggle';

interface Props {
  candidateName: string;
  statusLine?: string;
  lang: string;
  languages: string[];
  onLangChange: (lang: string) => void;
  t: UiStrings;
  /** left pane (desktop) / full screen (mobile) */
  resume: ReactNode;
  /**
   * Right pane (desktop) / bottom sheet (mobile). Receives the placement plus a
   * `close` callback so the sheet can render its own dismiss control.
   */
  chat: (variant: 'dock' | 'sheet', close: () => void) => ReactNode;
  /** badge count for the mobile launcher */
  unread?: number;
}

const DESKTOP = '(min-width: 1024px)';

/**
 * Split layout.
 *
 * ≥1024px — résumé and agent share the viewport 50/50, separated by a hairline
 * spine. <1024px — the résumé owns the screen and the agent lives in a bottom
 * sheet summoned by a floating launcher.
 *
 * The chat element is mounted exactly once and repositioned with CSS, so an
 * in-flight stream survives a viewport change or a sheet toggle.
 */
export function Layout({
  candidateName,
  statusLine,
  lang,
  languages,
  onLangChange,
  t,
  resume,
  chat,
  unread = 0,
}: Props) {
  const isDesktop = useMediaQuery(DESKTOP);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = isDesktop || sheetOpen;

  /* --------------------------------------------------------------- sheet -- */
  /* lock page scroll + bind Escape while the sheet is up */
  useEffect(() => {
    if (isDesktop || !sheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isDesktop, sheetOpen]);

  /* close the sheet automatically when the viewport grows to desktop */
  useEffect(() => {
    if (isDesktop) setSheetOpen(false);
  }, [isDesktop]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-paper">
      {/* ══ top bar ══════════════════════════════════════════════════════ */}
      <header className="relative z-40 shrink-0 border-b border-rule bg-surface">
        {/* signal line */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-accent/70" />

        <div className="flex items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
          {/* monogram */}
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center border border-rule bg-raised font-display text-[15px] font-bold text-ink"
          >
            {candidateName ? candidateName.trim().charAt(0) : '—'}
          </span>

          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-display text-[15px] leading-tight font-semibold text-ink sm:text-[16.5px]">
              {candidateName || t.masthead.candidate}
            </p>
            <p className="sys-label m-0 mt-[3px] hidden truncate tracking-[0.16em] sm:block">
              {statusLine || t.masthead.dossier}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <span className="hidden items-center gap-1.5 border-r border-rule pr-3 md:flex">
              <span className="live-dot" aria-hidden />
              <span className="font-mono text-[9.5px] tracking-[0.18em] text-teal uppercase">
                {t.chat.online}
              </span>
            </span>
            <LanguageSwitch languages={languages} value={lang} onChange={onLangChange} t={t} />
            <ThemeToggle t={t} />
          </div>
        </div>
      </header>

      {/* ══ body ═════════════════════════════════════════════════════════ */}
      <main className="relative flex min-h-0 flex-1">
        {/* résumé pane */}
        <div className="min-w-0 flex-1 bg-surface lg:w-1/2 lg:flex-none">
          <div className="h-full">{resume}</div>
        </div>

        {/* agent pane / bottom sheet — one instance, two placements */}
        <div
          className={cx(
            'z-50 flex flex-col bg-surface will-change-transform',
            'fixed inset-x-0 bottom-0 h-[78dvh] border-t border-rule shadow-[0_-24px_60px_-30px_rgba(0,0,0,0.55)]',
            'transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            'lg:static lg:z-auto lg:h-auto lg:w-1/2 lg:shrink-0 lg:translate-y-0 lg:border-t-0 lg:border-l lg:shadow-none',
            open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
          )}
          aria-hidden={!open}
          inert={!open ? true : undefined}
        >
          {chat(isDesktop ? 'dock' : 'sheet', closeSheet)}
        </div>

        {/* scrim */}
        {!isDesktop ? (
          <div
            onClick={closeSheet}
            className={cx(
              'fixed inset-0 z-40 bg-[rgb(12_11_16/0.55)] backdrop-blur-[3px] transition-opacity duration-300 lg:hidden',
              sheetOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-hidden
          />
        ) : null}
      </main>

      {/* ══ mobile launcher ══════════════════════════════════════════════ */}
      {!isDesktop && !sheetOpen ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            className="fab pointer-events-auto"
            onClick={() => setSheetOpen(true)}
            aria-label={t.chat.open}
            aria-expanded={false}
          >
            <ChatIcon className="h-4 w-4" />
            {t.chat.open}
            {unread > 0 ? <span className="fab__badge">{unread > 99 ? '99+' : unread}</span> : null}
          </button>
        </div>
      ) : null}

      {/* sheet dismissal: header button (rendered by ChatPanel), scrim tap or
          Escape. The grabber doubles as a visual affordance. */}

      {/* atmosphere */}
      <div className="vignette" aria-hidden />
      <div className="grain-layer" aria-hidden />
    </div>
  );
}

export default Layout;
