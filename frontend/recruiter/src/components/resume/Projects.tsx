import { useEffect, useState } from 'react';
import type { UiStrings } from '../../lib/i18n';
import { fetchProjectQuestions, type RecruiterQuestion } from '../../lib/api';
import type { ResumeProject } from '../../types/resume';
import { ArrowUpRight, ChatIcon, ChevronDown, GithubIcon, LayersIcon, LinkIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  items: ResumeProject[];
  lang: string;
  t: UiStrings;
}

/** Ask-event name shared with ChatPanel (see ChatPanel listener). */
export const ASK_EVENT = 'recruiter:ask';

/**
 * Selected projects as dossier cards. The long write-up (scope bullets +
 * impact highlights) is COLLAPSED by default; the AI-generated recruiter
 * questions are EXPANDED by default so a skimming recruiter's eye lands on
 * the interactive prompts first.
 */
export function Projects({ items, lang, t }: Props) {
  const isZh = lang.toLowerCase().startsWith('zh');
  const [questions, setQuestions] = useState<Record<string, RecruiterQuestion[]>>({});

  // Best-effort fetch: no questions on failure — cards render without prompts.
  useEffect(() => {
    let active = true;
    fetchProjectQuestions().then((q) => {
      if (active) setQuestions(q);
    });
    return () => {
      active = false;
    };
  }, []);

  const ask = (text: string, direct: boolean) => {
    window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text, direct } }));
  };

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
              // Repo names are shorter than résumé project titles ("career-agent-site"
              // vs "career-agent-site — Career Mentor Agent"), so match by prefix
              // in either direction.
              questions={
                Object.entries(questions).find(
                  ([k]) => project.name.startsWith(k) || k.startsWith(project.name),
                )?.[1] ?? []
              }
              t={t}
              onAsk={ask}
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
  questions,
  t,
  onAsk,
}: {
  index: number;
  project: ResumeProject;
  questions: RecruiterQuestion[];
  t: UiStrings;
  onAsk: (text: string, direct: boolean) => void;
}) {
  // Details collapsed by default; the question section (below) is the open part.
  const [expanded, setExpanded] = useState(false);
  const hasDetails = project.content.length > 0 || project.highlights.length > 0;

  return (
    <article className="dossier-card p-5 sm:p-6">
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

      {/* questions (open by default) ----------------------------- */}
      {questions.length > 0 && (
        <div className="mt-4">
          <p className="sys-label mb-2.5 flex items-center gap-2 text-accent">
            <ChatIcon className="h-3.5 w-3.5" aria-hidden />
            {t.projects.askTitle}
          </p>
          <div className="flex flex-col gap-1.5">
            {questions.map((q, qi) => (
              <button
                key={qi}
                type="button"
                onClick={() => onAsk(q.question, !q.needs_input)}
                className="group flex w-full items-start gap-2.5 border border-rule bg-raised/60 px-3 py-2 text-left transition-colors duration-150 hover:border-accent/60"
                title={q.needs_input ? t.projects.askHint : t.projects.askDirect}
              >
                <span
                  className={[
                    'mt-[2px] shrink-0 border px-1 py-[1px] font-mono text-[8.5px] tracking-[0.14em] uppercase',
                    q.needs_input
                      ? 'border-gold/55 bg-goldsoft text-gold'
                      : 'border-teal/45 bg-tealsoft text-teal',
                  ].join(' ')}
                >
                  {q.needs_input ? t.projects.askPrefill : t.projects.askDirect}
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-[1.7] text-soft group-hover:text-ink">
                  {q.question}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* collapsible details ------------------------------------- */}
      {hasDetails && (
        <div className="mt-4 border-t border-hair pt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="sys-label flex w-full items-center gap-2 bg-transparent p-0 text-left text-mute transition-colors duration-150 hover:text-accent"
          >
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
              aria-hidden
            />
            {t.projects.detailsTitle}
          </button>

          {expanded && (
            <div>
              {project.content.length > 0 && (
                <ul className="marker-list mt-4 space-y-2">
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
                    <span aria-hidden>▸</span>
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
