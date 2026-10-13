import { useEffect, useRef } from 'react';
import type { UiStrings } from '../../lib/i18n';
import type { ResumeProject } from '../../types/resume';
import { ArrowUpRight, ChatIcon, GithubIcon, LayersIcon, LinkIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  items: ResumeProject[];
  lang: string;
  t: UiStrings;
}

/** Ask-event name shared with ChatPanel (see ChatPanel listener). */
export const ASK_EVENT = 'recruiter:ask';

/** Focus-event name: ChatPanel shows per-project question prompts on it. */
export const FOCUS_EVENT = 'recruiter:project-focus';

/**
 * Selected projects as dossier cards. The write-up (scope bullets + impact
 * highlights) is always expanded — the card IS the details. Per-project
 * recruiter questions live in the chat panel: when a card gains focus
 * (hover, keyboard focus, or scrolled into view), the panel surfaces that
 * project's questions above the composer.
 */
export function Projects({ items, lang, t }: Props) {
  const isZh = lang.toLowerCase().startsWith('zh');

  return (
    <Reveal className="scroll-mt-6" id="projects">
      <SectionHead
        index="03"
        title={t.sections.projects}
        kicker={isZh ? 'PROJECTS' : '项目作品'}
        count={items.length}
        icon={<LayersIcon className="h-4 w-4" />}
      />

      {!items.length ? (
        <p className="sys-label m-0 py-6 text-center">{t.resume.emptyProjects}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((project, i) => (
            <ProjectCard
              key={`${project.name}-${i}`}
              index={i}
              project={project}
              isZh={isZh}
              t={t}
            />
          ))}
        </div>
      )}
    </Reveal>
  );
}

function ProjectCard({
  index,
  project,
  isZh: _isZh,
  t,
}: {
  index: number;
  project: ResumeProject;
  isZh: boolean;
  t: UiStrings;
}) {
  const ref = useRef<HTMLElement>(null);

  // Focus tracking: hover / keyboard focus / scrolled ≥50% into view all
  // dispatch a focus event so the chat panel swaps in this project's prompts.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.dispatchEvent(
              new CustomEvent(FOCUS_EVENT, { detail: { projectName: project.name } }),
            );
            break;
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [project.name]);

  const onEnter = () => {
    window.dispatchEvent(
      new CustomEvent(FOCUS_EVENT, { detail: { projectName: project.name } }),
    );
  };

  const hasDetails = project.content.length > 0 || project.highlights.length > 0;

  return (
    <article
      ref={ref}
      className="dossier-card p-5 sm:p-6"
      onMouseEnter={onEnter}
      onFocus={onEnter}
      tabIndex={-1}
    >
      {/* meta row ------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="sys-num">P-{String(index + 1).padStart(2, '0')}</span>
        <span className="h-px flex-1 bg-hair" aria-hidden />
        <span
          className={[
            'border px-1.5 py-[1px] font-mono text-[9px] tracking-[0.16em] uppercase',
            project.open_source
              ? 'border-teal/45 bg-tealsoft text-teal'
              : 'border-rule bg-raised text-mute',
          ].join(' ')}
        >
          {project.open_source ? t.resume.openSource : t.resume.closedSource}
        </span>
      </div>

      {/* title --------------------------------------------------- */}
      <h3 className="m-0 font-display text-[18px] leading-snug font-semibold text-ink sm:text-[20px]">
        {project.name}
      </h3>

      {(project.role || project.period) && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {project.role ? (
            <span className="font-mono text-[11px] tracking-[0.06em] text-accent uppercase">
              {project.role}
            </span>
          ) : null}
          {project.period ? (
            <span className="sys-label tabular-nums">{project.period}</span>
          ) : null}
        </div>
      )}

      {/* details — always expanded, the card IS the details ------- */}
      {hasDetails && (
        <div className="mt-4">
          {project.content.length > 0 && (
            <ul className="marker-list space-y-2">
              {project.content.map((c, ci) => (
                <li key={ci} className="text-[13.5px] leading-[1.85] text-soft">
                  {c}
                </li>
              ))}
            </ul>
          )}

          {project.highlights.length > 0 && (
            <div className="mt-4">
              <p className="sys-label mb-2.5 flex items-center gap-2 text-accent">
                <ChatIcon className="h-3.5 w-3.5" aria-hidden />
                {t.resume.highlights}
              </p>
              <ul className="m-0 list-none space-y-2 p-0">
                {project.highlights.map((h, hi) => (
                  <li
                    key={hi}
                    className="relative border-l-2 border-accent/55 bg-accentsoft/45 py-1.5 pr-3 pl-3 text-[13.5px] leading-[1.8] font-medium text-ink"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* links --------------------------------------------------- */}
      {project.demo_link || project.repo_link ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-hair pt-4">
          {project.demo_link ? (
            <a
              className="link-badge"
              href={project.demo_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LinkIcon className="h-3 w-3" />
              {t.resume.demo}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
          {project.repo_link ? (
            <a
              className="link-badge"
              href={project.repo_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon className="h-3 w-3" />
              {t.resume.repo}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default Projects;
