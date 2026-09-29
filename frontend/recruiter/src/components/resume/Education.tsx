import type { UiStrings } from '../../lib/i18n';
import type { ResumeEducation } from '../../types/resume';
import { CapIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  items: ResumeEducation[];
  lang: string;
  t: UiStrings;
}

/**
 * Education as stamped ledger rows — school in the display face, degree/field
 * and period in mono, so the three degrees read as a neat column of facts.
 */
export function Education({ items, lang, t }: Props) {
  if (!items.length) return null;
  const isZh = lang.toLowerCase().startsWith('zh');

  return (
    <Reveal className="scroll-mt-6" id="education">
      <SectionHead
        index="05"
        title={t.sections.education}
        kicker={isZh ? 'EDUCATION' : '教育背景'}
        count={items.length}
        icon={<CapIcon className="h-4 w-4" />}
      />

      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((edu, i) => (
          <li
            key={`${edu.school}-${i}`}
            className="group relative overflow-hidden border border-rule bg-surface p-4 transition-all duration-300 hover:-translate-y-[2px] hover:border-accent/45"
          >
            {/* corner fold */}
            <span
              aria-hidden
              className="absolute top-0 right-0 h-0 w-0 border-t-[18px] border-l-[18px] border-t-accent/25 border-l-transparent transition-all duration-300 group-hover:border-t-accent/60"
            />
            <div className="flex items-center gap-2.5">
              {edu.logo ? (
                <img
                  src={edu.logo}
                  alt=""
                  loading="lazy"
                  className="h-7 w-7 shrink-0 border border-hair bg-raised object-contain p-[2px]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center border border-hair bg-raised text-mute"
                >
                  <CapIcon className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="sys-num text-[9px] opacity-55">
                E-{String(i + 1).padStart(2, '0')}
              </span>
            </div>

            <h3 className="mt-3 mb-1 font-display text-[15px] leading-snug font-semibold text-ink">
              {edu.school}
            </h3>
            <p className="m-0 text-[13px] leading-relaxed text-soft">
              {edu.degree}
              {edu.field ? <span className="text-mute"> · {edu.field}</span> : null}
            </p>
            {edu.period ? (
              <p className="sys-label mt-2.5 mb-0 tabular-nums">{edu.period}</p>
            ) : null}
            {edu.verification && edu.verification.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hair pt-2.5">
                {edu.verification.map((v) => (
                  <a
                    key={v.url}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={v.code ? `${v.label} · 验证码 ${v.code}` : v.label}
                    className="inline-flex items-center gap-1 border border-accent/35 bg-accent/8 px-1.5 py-0.5 text-[10.5px] leading-none text-accent transition-colors hover:border-accent hover:bg-accent/15"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-2.5 w-2.5" aria-hidden>
                      <path d="M12 2 4.5 5v6c0 4.6 3.2 8.9 7.5 10.5 4.3-1.6 7.5-5.9 7.5-10.5V5L12 2Z" strokeLinejoin="round" />
                      <path d="m9 11.5 2.2 2.2L15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {v.label}
                    {v.code ? <span className="font-mono opacity-70">{v.code}</span> : null}
                  </a>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export default Education;
