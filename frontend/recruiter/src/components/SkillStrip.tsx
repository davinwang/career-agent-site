import { useEffect, useState } from 'react';
import { fetchRecruiterSkills, type RecruiterSkill } from '../lib/api';
import type { UiStrings } from '../lib/i18n';

interface Props {
  lang: string;
  t: UiStrings;
}

/**
 * Transparency strip above the chat composer: shows the NAMES of the
 * behaviour skills currently steering the agent in the visitor's language.
 * Skills are per-language server-side, so switching language re-fetches.
 *
 * Desktop: expanded by default (wrap chip list).
 * Mobile (≤768px): collapsed by default — a toggle row with count.
 */
export default function SkillStrip({ lang, t }: Props) {
  const [skills, setSkills] = useState<RecruiterSkill[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let active = true;
    fetchRecruiterSkills(lang).then((s) => {
      if (active) setSkills(s);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  // Desktop expanded / mobile collapsed by default; user can toggle either way.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setOpen(!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (skills.length === 0) return null;

  return (
    <div className="relative z-10 shrink-0 border-t border-rule bg-surface/95 px-4 py-1.5 sm:px-5 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[46rem]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mb-1 flex w-full items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] tracking-[0.16em] text-mute uppercase transition-colors hover:text-accent">
            {t.projects.skillsTitle}
          </span>
          <span className="shrink-0 border border-rule px-1 py-[1px] font-mono text-[8px] tracking-[0.12em] text-mute">
            {skills.length}
          </span>
          <span
            className="shrink-0 text-[9px] text-mute transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
        {open && (
          <ul className="flex flex-wrap gap-1.5 pb-1">
            {skills.map((s) => (
              <li
                key={s.id}
                title={t.projects.skillsHint}
                className="shrink-0 border border-rule bg-raised/60 px-2 py-[3px] font-mono text-[9.5px] tracking-[0.08em] text-mute"
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
