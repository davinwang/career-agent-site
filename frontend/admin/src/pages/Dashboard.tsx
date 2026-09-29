import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Session, KnowledgeItem, Project } from "../types/api";
import { SectionHead, Card, Badge, Spinner } from "../components/ui";
import GithubSettings from "../components/GithubSettings";
import {
  IconUpload,
  IconProjects,
  IconResume,
  IconSessions,
  IconChat,
} from "../components/icons";

interface Stats {
  languages: string[];
  knowledge: KnowledgeItem[];
  projects: Project[];
  sessions: Session[];
}



function relTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [langs, know, proj, sess] = await Promise.allSettled([
        api.getLanguages(),
        api.listKnowledge(),
        api.listProjects(),
        api.listSessions("recruiter"),
      ]);
      if (!active) return;
      const langsOk = langs.status === "fulfilled" ? langs.value : null;
      const knowOk = know.status === "fulfilled" ? know.value : null;
      const projOk = proj.status === "fulfilled" ? proj.value : null;
      const sessOk = sess.status === "fulfilled" ? sess.value : null;
      setOffline(!langsOk && !knowOk && !projOk && !sessOk);
      setStats({
        languages: langsOk?.languages ?? [],
        knowledge: knowOk?.knowledge ?? [],
        projects: projOk?.projects ?? [],
        sessions: sessOk?.sessions ?? [],
      });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading || !stats) return <Spinner label="加载概览数据…" />;

  const projByStatus = stats.projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const tiles = [
    { label: "简历语言", value: stats.languages.length || "—", sub: stats.languages.join(" / ") || "暂无", Icon: IconResume, to: "/chat" },
    { label: "知识库文档", value: stats.knowledge.length, sub: "已入库文件", Icon: IconUpload, to: "/chat" },
    { label: "项目", value: stats.projects.length, sub: `${projByStatus.done ?? 0} 已分析`, Icon: IconProjects, to: "/chat" },
    { label: "猎头会话", value: stats.sessions.length, sub: "累计对话", Icon: IconSessions, to: "/sessions" },
  ];

  return (
    <div className="space-y-8">
      {offline && (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--text-muted)" }}
        >
          后端服务暂不可用，以下为占位视图。请确认 API 已启动。
        </div>
      )}

      <section>
        <div className="rise">
          <SectionHead title="概览" en="At a glance" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <Link key={t.label} to={t.to} className="rise block" style={{ animationDelay: `${i * 60}ms` }}>
              <Card className="group h-full p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]">
                <div className="flex items-start justify-between">
                  <span className="label text-[0.6rem]">{t.label}</span>
                  <span className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]">
                    <t.Icon width={18} height={18} />
                  </span>
                </div>
                <div className="mt-3 font-display text-3xl font-bold tracking-tight">{t.value}</div>
                <div className="mt-1 truncate text-xs text-[var(--text-muted)]">{t.sub}</div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHead title="快捷操作" en="Quick actions" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { to: "/chat", label: "上传文档", Icon: IconUpload },
              { to: "/chat", label: "添加项目", Icon: IconProjects },
              { to: "/chat", label: "查看简历", Icon: IconResume },
            ].map((a, i) => (
              <Link key={a.to} to={a.to} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
                <Card className="flex flex-col items-center gap-2 p-5 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]">
                  <a.Icon width={22} height={22} />
                  <span className="text-sm font-medium">{a.label}</span>
                </Card>
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <SectionHead title="项目状态" en="Projects by status" />
            <Card className="divide-y" style={{ borderColor: "var(--rule)" }}>
              {["pending", "analyzing", "done", "error"].map((s) => (
                <div key={s} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-mono text-xs">{s}</span>
                  <Badge tone={s === "done" ? "moss" : s === "error" ? "warn" : "neutral"}>
                    {projByStatus[s] ?? 0}
                  </Badge>
                </div>
              ))}
            </Card>
          </div>

          <div className="mt-6">
            <GithubSettings />
          </div>
        </section>

        <section>
          <SectionHead
            title="最近猎头会话"
            en="Recent recruiter sessions"
            action={
              <Link to="/sessions" className="label text-[0.6rem] hover:text-[var(--accent)]">
                查看全部 →
              </Link>
            }
          />
          <Card className="divide-y overflow-hidden" style={{ borderColor: "var(--rule)" }}>
            {stats.sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[var(--text-muted)]">
                <IconChat width={26} height={26} />
                <span className="text-sm">暂无猎头会话</span>
              </div>
            ) : (
              stats.sessions.slice(0, 5).map((s) => (
                <Link
                  key={s.id}
                  to="/sessions"
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{s.id}</div>
                    <div className="label mt-0.5 text-[0.56rem]">
                      创建于 {new Date(s.created_at).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                  <Badge tone="accent">{relTime(s.updated_at)}</Badge>
                </Link>
              ))
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
