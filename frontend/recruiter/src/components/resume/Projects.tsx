import type { UiStrings } from '../../lib/i18n';
import type { ResumeProject } from '../../types/resume';
import { ArrowUpRight, GithubIcon, LayersIcon, LinkIcon } from '../Icons';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';

interface Props {
  items: ResumeProject[];
  lang: string;
  t: UiStrings;
}

/**
 * Selected projects as dossier cards. Scope bullets sit in the body, impact
 * statements are pulled into an accent-tinted block so a skimming recruiter's
 * eye lands on outcomes first.
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
            <article key={`${project.name}-${i}`} className="dossier-card p-5 sm:p-6">
              {/* meta row ------------------------------------------------ */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="sys-num">P-{String(i + 1).padStart(2, '0')}</span>
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

              {/* scope --------------------------------------------------- */}
              {project.content.length ? (
                <ul className="marker-list mt-4 space-y-2 border-t border-hair pt-4">
                  {project.content.map((c, ci) => (
                    <li key={ci} className="text-[13.5px] leading-[1.85] text-soft">
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* impact -------------------------------------------------- */}
              {project.highlights.length ? (
                <div className="mt-4 border-t border-hair pt-4">
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
              ) : null}

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
          ))}
        </div>
      )}
    </Reveal>
  );
}

export default Projects;
