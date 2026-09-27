import type { ReactNode } from 'react';

interface Props {
  /** zero-padded section number, e.g. "01" */
  index: string;
  title: string;
  /** optional secondary label shown after the main title */
  kicker?: string;
  count?: number;
  icon?: ReactNode;
  id?: string;
}

/**
 * Editorial section marker: mono numeral + display-serif title + a hairline
 * that draws itself when the block scrolls into view (driven by `.reveal.is-in`).
 */
export function SectionHead({ index, title, kicker, count, icon, id }: Props) {
  return (
    <div className="section-head mb-5 mt-12 first:mt-0" id={id}>
      <span className="sys-num shrink-0">{index}</span>
      {icon ? <span className="shrink-0 translate-y-[1px] text-accent/75">{icon}</span> : null}
      <span className="shrink-0 text-rule" aria-hidden>
        /
      </span>
      <h2 className="m-0 shrink-0 font-display text-[15px] font-semibold tracking-[0.16em] text-ink uppercase">
        {title}
      </h2>
      {kicker ? (
        <span className="sys-label hidden shrink-0 sm:inline" aria-hidden>
          {kicker}
        </span>
      ) : null}
      {typeof count === 'number' ? (
        <span className="sys-num shrink-0 tabular-nums opacity-70">
          {String(count).padStart(2, '0')}
        </span>
      ) : null}
      <span className="section-head__rule" aria-hidden />
    </div>
  );
}

export default SectionHead;
