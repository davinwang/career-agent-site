import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Session, KnowledgeItem, Project } from "../types/api";
import { SectionHead, Card, Badge, Spinner } from "../components/ui";
import { useAdminSkin } from "../hooks/useAdminSkin";
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

const SKIN_IDS = ["classic", "modern", "emerald"] as const;
type SkinId = (typeof SKIN_IDS)[number];

const SKINS: { id: SkinId; label: string; en: string; desc: string; swatch: string[] }[] = [
  {
    id: "classic",
    label: "经典报纸",
    en: "Classic",
    desc: "暖纸底色 · 衬线标题",
    swatch: ["#e9e2d3", "#b4441c", "#17141c"],
  },
  {
    id: "modern",
    label: "现代简约",
    en: "Modern",
    desc: "冷白卡片 · 靛蓝圆角",
    swatch: ["#f4f5f8", "#4f46e5", "#10131a"],
  },
  {
    id: "emerald",
    label: "墨绿典雅",
    en: "Emerald",
    desc: "象牙底色 · 祖母绿",
    swatch: ["#eceee6", "#1d6b4f", "#131a15"],
  },
];

function SkinPicker() {
  const { skin, setSkin } = useAdminSkin();
  const [saving, setSaving] = useState<SkinId | null>(null);

  const choose = (next: SkinId) => {
    if (next === skin || saving) return;
    setSaving(next);
    setSkin(next);
    setSaving(null);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SKINS.map((s) => {
        const selected = skin === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => choose(s.id)}
            disabled={saving !== null}
            aria-pressed={selected}
            className="rise flex items-start gap-3 rounded-md border p-3 text-left transition-all hover:-translate-y-0.5 disabled:opacity-60"
            style={{
              borderColor: selected ? "var(--accent)" : "var(--rule)",
              background: selected ? "var(--accent-soft)" : "var(--surface)",
              borderWidth: selected ? 2 : 1,
            }}
          >
            <span className="mt-0.5 flex flex-none overflow-hidden rounded-sm border" style={{ borderColor: "var(--rule)" }}>
              {s.swatch.map((c) => (
                <span key={c} style={{ width: 10, height: 26, background: c }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {s.label} <span className="label ml-1 text-[0.56rem]">{s.en}</span>
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{s.desc}</span>
              {selected && <span className="label mt-1 block text-[0.56rem] text-[var(--accent)]">✓ 当前使用</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
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
            <SectionHead title="管理端界面" en="Admin UI theme" />
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              仅作用于管理端外观；猎头端访客在页面右上角自行选择。
            </p>
            <SkinPicker />
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
