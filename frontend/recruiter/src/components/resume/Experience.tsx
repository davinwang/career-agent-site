import type { UiStrings } from '../../lib/i18n';
import { cx } from '../../lib/utils';
import type { ResumeExperience } from '../../types/resume';
import { BriefcaseIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  items: ResumeExperience[];
  lang: string;
  t: UiStrings;
}

function Logo({ src, alt }: { src?: string; alt: string }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center border border-rule bg-raised font-display text-[13px] font-bold text-mute"
      >
        {alt.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-9 w-9 shrink-0 border border-rule bg-surface object-contain p-[3px]"
      onError={(e) => {
        // Missing vendor asset — hide rather than show a broken-image glyph.
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  );
}

/**
 * Work history as a vertical dossier timeline: diamond markers on a hairline
 * rail, company set in the display face, role/period in mono.
 */
export function Experience({ items, lang, t }: Props) {
  if (!items.length) return null;
  const isZh = lang.toLowerCase().startsWith('zh');

  return (
    <Reveal className="scroll-mt-6" id="experience">
      <SectionHead
        index="02"
        title={t.sections.experience}
        kicker={isZh ? 'EXPERIENCE' : '工作经历'}
        count={items.length}
        icon={<BriefcaseIcon className="h-4 w-4" />}
      />

      <ol className="m-0 list-none p-0">
        {items.map((job, i) => (
          <li
            key={`${job.company}-${i}`}
            className="timeline-item group relative pb-9 pl-8 last:pb-0"
          >
            {i < items.length - 1 ? <span className="timeline-rail" aria-hidden /> : null}
            <span className="timeline-dot absolute top-[6px] left-0" aria-hidden />

            <div className="flex items-start gap-3.5">
              <Logo src={job.logo} alt={job.company} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3
                    className={cx(
                      'm-0 font-display text-[17px] leading-snug font-semibold text-ink sm:text-[18.5px]',
                      !isZh && 'tracking-[-0.01em]',
                    )}
                  >
                    <span className="underline-sweep">{job.company}</span>
                  </h3>
                  {job.period ? (
                    <span className="sys-num shrink-0 text-[10px] tracking-[0.1em] text-mute tabular-nums">
                      {job.period}
                    </span>
                  ) : null}
                </div>

                {job.role ? (
                  <p className="mt-1 mb-0 font-mono text-[11px] tracking-[0.09em] text-accent uppercase">
                    {job.role}
                  </p>
                ) : null}

                {job.highlights.length ? (
                  <ul className="marker-list mt-3.5 space-y-2">
                    {job.highlights.map((h, hi) => (
                      <li
                        key={hi}
                        className="text-[13.8px] leading-[1.85] text-soft transition-colors duration-300 group-hover:text-ink"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

export default Experience;
