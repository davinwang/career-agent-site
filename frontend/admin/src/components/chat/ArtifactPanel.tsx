import { useEffect, useState } from "react";
import { api, ApiError, API_BASE } from "../../lib/api";
import type { ResumeData } from "../../types/resume";
import ResumePreview from "../ResumePreview";
import { Badge, Spinner } from "../ui";
import {
  IconResume,
  IconUpload,
  IconProjects,
  IconSkills,
  IconClose,
  IconDownload,
  IconSpinner,
} from "../icons";

/** Everything the conversation produced, in one payload. */
interface Artifacts {
  resumes: { lang: string; name: string | null; photo: string | null }[];
  knowledge: { id: string; filename: string; source_type: string; created_at: string; excerpt: string }[];
  projects: { id: string; name: string; repo_url: string | null; status: string; created_at: string; has_doc: number }[];
  skills: { id: string; name: string; prompt: string; enabled: boolean; priority: number }[];
}

const GRID_CELLS = [
  { kind: "resume", label: "简历", en: "Resume" },
  { kind: "knowledge", label: "材料", en: "Docs" },
  { kind: "projects", label: "项目", en: "Projects" },
  { kind: "skills", label: "技能卡", en: "Skills" },
] as const;

type CellKind = (typeof GRID_CELLS)[number]["kind"];

function countFor(a: Artifacts | null, kind: CellKind): number {
  if (!a) return 0;
  switch (kind) {
    case "resume":
      return a.resumes.length;
    case "knowledge":
      return a.knowledge.length;
    case "projects":
      return a.projects.length;
    case "skills":
      return a.skills.length;
  }
}

function iconFor(kind: CellKind) {
  switch (kind) {
    case "resume":
      return IconResume;
    case "knowledge":
      return IconUpload;
    case "projects":
      return IconProjects;
    case "skills":
      return IconSkills;
  }
}

export function useArtifacts(refreshKey: number) {
  const [data, setData] = useState<Artifacts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await api.getArtifacts();
        if (active) setData(r as Artifacts);
      } catch {
        /* artifacts are best-effort decoration */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return { data, loading };
}

/** The nine-grid (four-cell) artifact panel beside the chat. */
export default function ArtifactPanel({
  refreshKey,
  onAsk,
}: {
  refreshKey: number;
  onAsk: (text: string) => void;
}) {
  const { data, loading } = useArtifacts(refreshKey);
  const [openKind, setOpenKind] = useState<CellKind | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="label text-[0.62rem]">成果 · Artifacts</div>
        {loading && <IconSpinner width={14} height={14} />}
      </div>

      {/* Grid: 2x2 on the panel; becomes the "nine-grid" on narrow widths */}
      <div className="grid grid-cols-2 gap-2.5">
        {GRID_CELLS.map((cell) => {
          const Icon = iconFor(cell.kind);
          const count = countFor(data, cell.kind);
          const empty = count === 0;
          return (
            <button
              key={cell.kind}
              type="button"
              onClick={() => setOpenKind(cell.kind)}
              className="rise group flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]"
              style={{
                borderColor: openKind === cell.kind ? "var(--accent)" : "var(--rule)",
                background: empty ? "color-mix(in srgb, var(--surface) 60%, transparent)" : "var(--surface)",
                borderStyle: empty ? "dashed" : "solid",
              }}
            >
              <span
                className="transition-colors group-hover:text-[var(--accent)]"
                style={{ color: empty ? "var(--text-muted)" : "var(--accent)" }}
              >
                <Icon width={20} height={20} />
              </span>
              <span className="text-xs font-medium">{cell.label}</span>
              <span className="label text-[0.56rem]">{empty ? "待生成" : `${count}`}</span>
            </button>
          );
        })}
      </div>

      {/* Detail view for the opened cell */}
      {openKind && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "var(--rule)" }}>
          <Detail kind={openKind} data={data} onAsk={onAsk} onClose={() => setOpenKind(null)} />
        </div>
      )}

      <p className="mt-3 text-[0.66rem] leading-relaxed text-[var(--text-muted)]">
        所有成果均由对话生成 · 点击卡片查看，修改请回到对话
      </p>
    </div>
  );
}

function Detail({
  kind,
  data,
  onAsk,
  onClose,
}: {
  kind: CellKind;
  data: Artifacts | null;
  onAsk: (text: string) => void;
  onClose: () => void;
}) {
  const cell = GRID_CELLS.find((c) => c.kind === kind)!;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="label text-[0.6rem]">
          {cell.label} · {cell.en}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <IconClose width={15} height={15} />
        </button>
      </div>

      {!data ? (
        <Spinner label="加载中…" />
      ) : kind === "resume" ? (
        <ResumeDetail resumes={data.resumes} onAsk={onAsk} />
      ) : kind === "knowledge" ? (
        <ListDetail
          items={data.knowledge.map((k) => ({
            id: k.id,
            title: k.filename,
            sub: `${k.source_type} · ${new Date(k.created_at).toLocaleDateString("zh-CN")}`,
          }))}
          empty="还没有材料，上传 PDF / 文档 / 图片后自动入库"
          askText="帮我整理知识库材料"
        />
      ) : kind === "projects" ? (
        <ListDetail
          items={data.projects.map((p) => ({
            id: p.id,
            title: p.name,
            sub: p.repo_url ? p.repo_url.replace(/^https?:\/\/(www\.)?github\.com\//, "") : "—",
            badge: p.status,
          }))}
          empty="还没有项目，提供 git URL 或上传项目文档开始分析"
          askText="帮我分析一个项目"
        />
      ) : (
        <ListDetail
          items={data.skills.map((s) => ({
            id: s.id,
            title: s.name,
            sub: s.prompt.slice(0, 60) + (s.prompt.length > 60 ? "…" : ""),
            badge: s.enabled ? "on" : "off",
          }))}
          empty="还没有技能卡（提示词），让导师帮你配置猎头端行为"
          askText="帮我配置猎头端的提示词技能"
        />
      )}
    </div>
  );
}

function ResumeDetail({
  resumes,
  onAsk,
}: {
  resumes: { lang: string; name: string | null; photo: string | null }[];
  onAsk: (t: string) => void;
}) {
  const [preview, setPreview] = useState<{ lang: string; data: ResumeData } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (lang: string) => {
    setDownloading(lang);
    try {
      const blob = await api.downloadPdf(lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  if (preview) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="label text-[0.6rem] hover:text-[var(--accent)]"
          >
            ← 返回列表
          </button>
          <Badge tone="neutral">{preview.lang}</Badge>
        </div>
        <div className="max-h-[52vh] overflow-y-auto rounded-md" style={{ background: "var(--surface-sunken)" }}>
          <ResumePreview data={preview.data} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {resumes.length === 0 && (
        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
          还没有简历。上传一份 PDF 简历给导师开始。
        </div>
      )}
      {resumes.map((r) => (
        <div
          key={r.lang}
          className="flex items-center gap-2.5 rounded-md border p-2.5"
          style={{ borderColor: "var(--rule)" }}
        >
          {r.photo ? (
            <img
              src={r.photo.startsWith("http") ? r.photo : `${API_BASE}${r.photo}`}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <IconResume width={16} height={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.name ?? "未命名"}</div>
            <div className="label text-[0.56rem]">{r.lang.toUpperCase()}</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const env = await api.getResume(r.lang);
                setPreview({ lang: r.lang, data: env.data as ResumeData });
              } catch (err) {
                if (err instanceof ApiError) console.error(err.message);
              }
            }}
            className="label text-[0.58rem] hover:text-[var(--accent)]"
          >
            预览
          </button>
          <button
            type="button"
            onClick={() => download(r.lang)}
            disabled={downloading === r.lang}
            aria-label="下载 PDF"
            className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {downloading === r.lang ? <IconSpinner width={14} height={14} /> : <IconDownload width={15} height={15} />}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onAsk("请基于现有材料，为我生成/完善英文简历，保持与中文版内容一致。")}
        className="label mt-1 w-full rounded-md border border-dashed py-2 text-[0.6rem] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ borderColor: "var(--rule)" }}
      >
        + 新语言版本
      </button>
    </div>
  );
}

function ListDetail({
  items,
  empty,
  askText,
}: {
  items: { id: string; title: string; sub?: string; badge?: string }[];
  empty: string;
  askText: string;
}) {
  if (items.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--text-muted)]">{empty}</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-2 rounded-md border px-2.5 py-2"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.8rem] font-medium">{it.title}</div>
            {it.sub && <div className="label truncate text-[0.54rem]">{it.sub}</div>}
          </div>
          {it.badge && <Badge tone={it.badge === "done" || it.badge === "on" ? "moss" : "neutral"}>{it.badge}</Badge>}
        </div>
      ))}
      <div className="pt-1 text-center text-[0.6rem] text-[var(--text-muted)]">
        修改请回到对话，例如「{askText}」
      </div>
    </div>
  );
}
