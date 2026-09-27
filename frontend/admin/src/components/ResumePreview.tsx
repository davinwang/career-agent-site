import type { ResumeData } from "../types/resume";

/** Editorial resume renderer — mirrors what the recruiter-facing page shows. */
export default function ResumePreview({ data }: { data: ResumeData }) {
  const skills = data.skills ?? {};
  const skillGroups = Object.entries(skills);

  return (
    <article
      className="mx-auto max-w-3xl rounded-lg border p-6 sm:p-10"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      {/* Header */}
      <header className="border-b pb-5" style={{ borderColor: "var(--rule)" }}>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {data.name || "未命名"}
        </h1>
        {data.status && (
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{data.status}</p>
        )}
        {data.tags && data.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border px-2.5 py-0.5 text-[0.7rem]"
                style={{ borderColor: "var(--rule)", color: "var(--accent)", background: "var(--accent-soft)" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {data.summary && (
        <section className="mt-6">
          <SectionTitle zh="个人简介" en="Summary" />
          <p className="text-[0.92rem] leading-relaxed text-[var(--text)]">{data.summary}</p>
        </section>
      )}

      {data.experience && data.experience.length > 0 && (
        <section className="mt-7">
          <SectionTitle zh="工作经历" en="Experience" />
          <div className="space-y-5">
            {data.experience.map((e, i) => (
              <div key={i} className="relative pl-4">
                <span
                  className="absolute left-0 top-1.5 h-full w-px"
                  style={{ background: "var(--rule)" }}
                />
                <span
                  className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="font-display text-base font-semibold">{e.company}</h3>
                  {e.period && (
                    <span className="font-mono text-[0.7rem] text-[var(--text-muted)]">{e.period}</span>
                  )}
                </div>
                {e.role && <div className="text-sm text-[var(--accent)]">{e.role}</div>}
                {e.highlights && (
                  <ul className="mt-2 space-y-1">
                    {e.highlights.map((h, j) => (
                      <li key={j} className="flex gap-2 text-[0.86rem] leading-relaxed">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--text-muted)" }} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.projects && data.projects.length > 0 && (
        <section className="mt-7">
          <SectionTitle zh="项目经历" en="Projects" />
          <div className="space-y-5">
            {data.projects.map((p, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="font-display text-base font-semibold">{p.name}</h3>
                  {p.period && (
                    <span className="font-mono text-[0.7rem] text-[var(--text-muted)]">{p.period}</span>
                  )}
                </div>
                {p.role && <div className="text-sm text-[var(--accent)]">{p.role}</div>}
                {p.highlights && p.highlights.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.highlights.map((h, j) => (
                      <li key={j} className="flex gap-2 text-[0.86rem] leading-relaxed">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--text-muted)" }} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(p.demo_link || p.repo_link) && (
                  <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[0.7rem]">
                    {p.demo_link && (
                      <a href={p.demo_link} target="_blank" rel="noreferrer" className="accent-text underline">
                        demo ↗
                      </a>
                    )}
                    {p.repo_link && (
                      <a href={p.repo_link} target="_blank" rel="noreferrer" className="accent-text underline">
                        repo ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {skillGroups.length > 0 && (
        <section className="mt-7">
          <SectionTitle zh="技能" en="Skills" />
          <div className="space-y-3">
            {skillGroups.map(([group, items]) => (
              <div key={group}>
                <div className="label mb-1 text-[0.6rem]">{group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(items as string[]).map((s) => (
                    <span
                      key={s}
                      className="rounded border px-2 py-0.5 text-[0.75rem]"
                      style={{ borderColor: "var(--rule)", background: "var(--surface-sunken)" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.education && data.education.length > 0 && (
        <section className="mt-7">
          <SectionTitle zh="教育背景" en="Education" />
          <div className="space-y-3">
            {data.education.map((ed, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div>
                  <span className="font-display text-base font-semibold">{ed.school}</span>
                  <span className="ml-2 text-sm text-[var(--text-muted)]">
                    {[ed.degree, ed.field].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {ed.period && (
                  <span className="font-mono text-[0.7rem] text-[var(--text-muted)]">{ed.period}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function SectionTitle({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="font-display text-lg font-semibold tracking-tight">{zh}</h2>
      <span className="label text-[0.58rem]">{en}</span>
      <span className="ml-1 h-px flex-1" style={{ background: "var(--rule)" }} />
    </div>
  );
}
