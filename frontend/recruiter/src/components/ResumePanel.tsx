import type { UiStrings } from '../lib/i18n';
import type { ResumeData } from '../types/resume';
import { AlertIcon, RefreshIcon } from './Icons';
import Education from './resume/Education';
import Experience from './resume/Experience';
import Header from './resume/Header';
import Projects from './resume/Projects';
import Skills from './resume/Skills';
import Summary from './resume/Summary';

interface Props {
  data: ResumeData | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  lang: string;
  t: UiStrings;
  stamp?: string;
  onRetry: () => void;
}

const SECTIONS = [
  { id: 'summary', zh: '概述', en: 'Profile', n: '01' },
  { id: 'experience', zh: '经历', en: 'Work', n: '02' },
  { id: 'projects', zh: '项目', en: 'Projects', n: '03' },
  { id: 'skills', zh: '技能', en: 'Skills', n: '04' },
  { id: 'education', zh: '教育', en: 'Education', n: '05' },
];

/** Skeleton shown while the dossier is in flight. */
function Skeleton({ t }: { t: UiStrings }) {
  return (
    <div className="animate-[fade-in_0.4s_ease-out_both]" aria-busy="true" aria-live="polite">
      <p className="sys-label mb-8 flex items-center gap-2">
        <span className="live-dot" aria-hidden />
        {t.resume.loading}
        <span className="normal-case">— {t.resume.loadingHint}</span>
      </p>
      <div className="h-14 w-2/3 bg-raised" />
      <div className="mt-3 h-3 w-1/2 bg-raised" />
      <div className="mt-6 flex gap-2">
        {[64, 88, 52, 76, 60].map((w, i) => (
          <span key={i} className="h-6 bg-raised" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-14 h-px w-full bg-rule" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="mt-8 flex gap-4">
          <span className="h-9 w-9 shrink-0 bg-raised" />
          <div className="flex-1">
            <div className="h-4 w-1/3 bg-raised" />
            <div className="mt-3 h-2.5 w-full bg-raised/70" />
            <div className="mt-2 h-2.5 w-[92%] bg-raised/70" />
            <div className="mt-2 h-2.5 w-[78%] bg-raised/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Left pane: the dossier itself. A sticky mono index lets a recruiter jump
 * between sections without scrolling back up.
 */
export function ResumePanel({ data, loading, error, offline, lang, t, stamp, onRetry }: Props) {
  const isZh = lang.toLowerCase().startsWith('zh');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* sticky section index ------------------------------------------------ */}
      <nav
        aria-label={isZh ? '简历目录' : 'Résumé sections'}
        className="z-20 shrink-0 border-b border-hair bg-surface/88 px-5 py-2 backdrop-blur-md sm:px-8"
      >
        <ul className="scroll-slim m-0 flex list-none gap-4 overflow-x-auto p-0 sm:gap-6">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="group flex items-baseline gap-1.5 whitespace-nowrap py-1 font-mono text-[10.5px] tracking-[0.14em] text-mute uppercase transition-colors duration-200 hover:text-accent"
              >
                <span className="sys-num text-[9px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {s.n}
                </span>
                {isZh ? s.zh : s.en}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* scrollable body ----------------------------------------------------- */}
      <div
        className="scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="region"
        aria-label={t.a11y.resumePanel}
      >
        <div className="mx-auto w-full max-w-[62rem] px-5 py-8 sm:px-8 sm:py-11 lg:px-10">
          {offline ? (
            <div className="mb-8 flex items-start gap-3 border border-dashed border-gold/55 bg-goldsoft px-4 py-3">
              <AlertIcon className="mt-[2px] h-4 w-4 shrink-0 text-gold" />
              <div className="min-w-0">
                <p className="m-0 font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                  {t.masthead.offlineBadge}
                </p>
                <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-soft">
                  {t.masthead.offlineHint}
                  {error ? <span className="text-mute"> ({error})</span> : null}
                </p>
              </div>
              <button type="button" className="icon-btn ml-auto shrink-0" onClick={onRetry} title={t.resume.retry} aria-label={t.resume.retry}>
                <RefreshIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <Skeleton t={t} />
          ) : data ? (
            <>
              <Header data={data} lang={lang} t={t} stamp={stamp} />
              <Summary summary={data.summary} lang={lang} t={t} />
              <Experience items={data.experience} lang={lang} t={t} />
              <Projects items={data.projects} lang={lang} t={t} />
              <Skills skills={data.skills} lang={lang} t={t} />
              <Education items={data.education} lang={lang} t={t} />

              {/* colophon ------------------------------------------------ */}
              <footer className="mt-16 mb-2 border-t border-rule pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="sys-label m-0">
                    {isZh ? '档案结束' : 'End of dossier'}
                    <span className="mx-2 text-rule" aria-hidden>
                      ///
                    </span>
                    {isZh ? '有疑问请直接询问右侧 AI 助手' : 'Ask the agent anything'}
                  </p>
                  <p className="sys-label m-0 tabular-nums">
                    {stamp ? `${t.chat.session} #${stamp}` : ''}
                  </p>
                </div>
              </footer>
            </>
          ) : (
            /* No dossier and nothing in flight — say so, offer a way out. */
            <div className="animate-[fade-in_0.4s_ease-out_both] border border-dashed border-accent/55 bg-accentsoft/40 px-5 py-6">
              <p className="sys-label mb-3 flex items-center gap-2 text-accent">
                <AlertIcon className="h-3.5 w-3.5" />
                {t.resume.failed}
              </p>
              {error ? (
                <p className="m-0 mb-5 font-mono text-[11.5px] break-all text-mute">{error}</p>
              ) : null}
              <button type="button" className="link-badge" onClick={onRetry}>
                <RefreshIcon className="h-3 w-3" />
                {t.resume.retry}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResumePanel;
