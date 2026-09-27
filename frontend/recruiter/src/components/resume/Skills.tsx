import type { UiStrings } from '../../lib/i18n';
import { GridIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  skills: Record<string, string[]>;
  lang: string;
  t: UiStrings;
}

/**
 * Skill matrix. Categories are laid out as labelled rows so the reader can scan
 * the axis labels vertically, then the chips horizontally — a matrix rather
 * than a wall of tags.
 */
export function Skills({ skills, lang, t }: Props) {
  const entries = Object.entries(skills).filter(([, items]) => items.length > 0);
  if (!entries.length) return null;
  const isZh = lang.toLowerCase().startsWith('zh');
  const total = entries.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <Reveal className="scroll-mt-6" id="skills">
      <SectionHead
        index="04"
        title={t.sections.skills}
        kicker={isZh ? 'SKILLS' : '技能矩阵'}
        count={total}
        icon={<GridIcon className="h-4 w-4" />}
      />

      <dl className="m-0 flex flex-col">
        {entries.map(([category, items], i) => (
          <div
            key={category}
            className="group grid grid-cols-1 gap-x-5 gap-y-2 border-t border-hair py-4 first:border-t-0 first:pt-0 md:grid-cols-[9.5rem_1fr]"
          >
            <dt className="flex items-baseline gap-2 md:pt-[3px]">
              <span className="sys-num text-[9px] opacity-55">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-[11px] leading-tight font-medium tracking-[0.1em] text-ink uppercase transition-colors duration-300 group-hover:text-accent">
                {category}
              </span>
            </dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {items.map((skill) => (
                <span key={skill} className="chip text-[12px]">
                  {skill}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Reveal>
  );
}

export default Skills;
