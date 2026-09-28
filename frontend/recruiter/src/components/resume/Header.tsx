import type { UiStrings } from '../../lib/i18n';
import { vars } from '../../lib/utils';
import type { ResumeData } from '../../types/resume';

interface Props {
  data: ResumeData;
  lang: string;
  t: UiStrings;
  /** short session id, printed as a dossier stamp */
  stamp?: string;
}

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '—';
  // CJK: take the surname (first char). Latin: take up to two initials.
  if (/[\u3400-\u9fff]/.test(trimmed)) return trimmed.slice(0, 1);
  return trimmed
    .split(/[\s(]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * Masthead — the one thing a recruiter remembers. Oversized display type, an
 * availability pulse, a dossier stamp and the tag cloud, all revealed in a
 * single staggered cascade on load.
 */
export function Header({ data, lang, t, stamp }: Props) {
  const isZh = lang.toLowerCase().startsWith('zh');
  const initials = monogram(data.name);

  return (
    <header className="relative overflow-hidden border-b border-rule pb-8">
      {/* corner hatch + ghost monogram: quiet depth, no gradient clichés */}
      <div
        aria-hidden
        className="hatch pointer-events-none absolute -top-16 -right-16 h-56 w-56 rotate-12 opacity-[0.5]"
      />
      <span
        aria-hidden
        className="display-name pointer-events-none absolute -right-4 -bottom-16 select-none text-[13rem] leading-none text-ink opacity-[0.035] sm:text-[17rem]"
      >
        {initials}
      </span>

      <div className="stagger-in relative" style={vars({ '--stagger-base': '80ms' })}>
        {/* ── kicker ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3" style={vars({ '--i': 0 })}>
          <span className="sys-label whitespace-nowrap">{t.masthead.dossier}</span>
          <span className="h-px w-8 bg-rule" aria-hidden />
          <span className="sys-label whitespace-nowrap">
            {isZh ? '架构师 · 金融科技' : 'Architect · FinTech'}
          </span>
        </div>

        {/* ── name ───────────────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
          {data.photo ? (
            <img
              src={data.photo.startsWith('http') ? data.photo : data.photo}
              alt={data.name}
              className="h-20 w-20 shrink-0 rounded-lg border border-rule object-cover sm:h-24 sm:w-24"
              style={vars({ '--i': 1 })}
            />
          ) : null}
          <div className="min-w-0 flex-1" style={vars({ '--i': 1 })}>
            <h1
              className={`display-name m-0 text-[clamp(2.6rem,7.2vw,4.6rem)] text-ink ${isZh ? 'zh' : ''}`}
            >
              {data.name || (isZh ? '候选人' : 'Candidate')}
            </h1>
          </div>

          {/* availability block — right aligned, mono, terminal-like */}
          <div
            className="mb-2 shrink-0 border-l-2 border-accent pl-4"
            style={vars({ '--i': 2 })}
          >
            <div className="flex items-center gap-2">
              <span className="live-dot" aria-hidden />
              <span className="sys-label text-teal">{t.masthead.available}</span>
            </div>
            {stamp ? (
              <p className="sys-label mt-1.5 tracking-[0.14em] normal-case">
                {t.chat.session} <span className="text-soft">#{stamp}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ── status line ────────────────────────────────────────────────── */}
        {data.status ? (
          <p
            className="mt-4 max-w-3xl font-mono text-[11.5px] leading-relaxed tracking-[0.06em] text-soft uppercase"
            style={vars({ '--i': 3 })}
          >
            {data.status}
          </p>
        ) : null}

        {/* ── tags ───────────────────────────────────────────────────────── */}
        {data.tags.length ? (
          <ul
            className="mt-6 flex flex-wrap gap-1.5 p-0"
            aria-label={isZh ? '关键标签' : 'Key tags'}
            style={vars({ '--i': 4 })}
          >
            {data.tags.map((tag, i) => (
              <li
                key={tag}
                className="chip animate-[pop-in_0.4s_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ animationDelay: `${420 + i * 42}ms` }}
              >
                <span className="sys-num text-[9px] opacity-60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}

export default Header;
