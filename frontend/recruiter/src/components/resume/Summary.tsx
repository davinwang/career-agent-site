import type { UiStrings } from '../../lib/i18n';
import { DocIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  summary: string;
  lang: string;
  t: UiStrings;
}

/**
 * The lede. Set as a broadsheet opening paragraph with a dropped initial and a
 * generous measure so 200+ words of Chinese still read comfortably.
 */
export function Summary({ summary, lang, t }: Props) {
  if (!summary) return null;
  const isZh = lang.toLowerCase().startsWith('zh');

  // Drop caps only look right on Latin text; CJK gets a leading accent bar.
  const paragraphs = summary
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Reveal className="scroll-mt-6" id="summary">
      <SectionHead
        index="01"
        title={t.sections.summary}
        kicker={isZh ? 'PROFILE' : '个人概述'}
        icon={<DocIcon className="h-4 w-4" />}
      />

      <div className="relative pl-5 sm:pl-7">
        <span
          aria-hidden
          className="accent-fade absolute top-1.5 bottom-1.5 left-0 w-[2px]"
        />
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={[
              'm-0 max-w-[68ch] text-[14.5px] leading-[1.95] text-soft sm:text-[15.5px]',
              i > 0 ? 'mt-4' : '',
              i === 0 && !isZh ? 'drop-quote' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {p}
          </p>
        ))}
      </div>
    </Reveal>
  );
}

export default Summary;
