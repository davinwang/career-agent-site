import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Project, ProjectDoc } from "../types/api";
import { SectionHead, Card, Badge, Spinner, ErrorNote, EmptyState, Modal } from "../components/ui";
import { IconProjects, IconPlus, IconSpinner, IconSearch, IconResume } from "../components/icons";

const STATUS_TONE: Record<string, "neutral" | "accent" | "moss" | "warn"> = {
  pending: "neutral",
  analyzing: "accent",
  done: "moss",
  error: "warn",
};

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listProjects();
      setProjects(r.projects ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载项目失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.addRepo(url.trim(), name.trim() || undefined);
      setUrl("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加仓库失败");
    } finally {
      setAdding(false);
    }
  };

  const onAnalyze = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.analyzeProject(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "触发分析失败");
    } finally {
      setBusyId(null);
    }
  };

  const openDoc = async (p: Project) => {
    setBusyId(p.id);
    setError(null);
    try {
      const doc: ProjectDoc = await api.getProjectDoc(p.id);
      setViewer({ title: `${p.name} · 项目文档`, body: doc.doc || "（暂无生成文档）" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取文档失败");
    } finally {
      setBusyId(null);
    }
  };

  const openResumeContent = async (p: Project) => {
    setBusyId(p.id);
    setError(null);
    try {
      const doc: ProjectDoc = await api.getProjectDoc(p.id);
      const body =
        typeof doc.resume_content === "string"
          ? doc.resume_content
          : JSON.stringify(doc.resume_content ?? {}, null, 2);
      setViewer({ title: `${p.name} · 简历内容`, body: body || "（暂无简历内容）" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取简历内容失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <SectionHead title="项目管理" en="Repositories & analysis" />

      {/* Add repo form */}
      <form onSubmit={onAdd} className="card space-y-3 p-4">
        <div className="label text-[0.62rem]">添加代码仓库</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1 font-mono text-sm"
            placeholder="https://github.com/user/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className="input sm:w-48"
            placeholder="名称（可选）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={adding || !url.trim()} className="btn btn-primary shrink-0">
            {adding ? <IconSpinner width={15} height={15} /> : <IconPlus width={15} height={15} />}
            添加
          </button>
        </div>
      </form>

      {error && <ErrorNote message={error} />}

      {loading ? (
        <Spinner label="加载项目…" />
      ) : projects.length === 0 ? (
        <EmptyState icon={<IconProjects width={40} height={40} />} title="暂无项目" hint="添加一个 Git 仓库开始分析" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p, i) => (
            <Card key={p.id} className="rise flex flex-col p-4" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold">{p.name}</h3>
                  {p.repo_url && (
                    <a
                      href={p.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block truncate font-mono text-[0.7rem] accent-text hover:underline"
                    >
                      {p.repo_url}
                    </a>
                  )}
                </div>
                <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
              </div>

              <div className="label mt-2 text-[0.56rem]">
                {new Date(p.created_at).toLocaleDateString("zh-CN")}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
                <button
                  type="button"
                  onClick={() => onAnalyze(p.id)}
                  disabled={busyId === p.id || p.status === "analyzing"}
                  className="btn flex-1"
                >
                  {busyId === p.id || p.status === "analyzing" ? (
                    <IconSpinner width={14} height={14} />
                  ) : (
                    <IconSearch width={14} height={14} />
                  )}
                  分析
                </button>
                <button type="button" onClick={() => openDoc(p)} disabled={busyId === p.id} className="btn flex-1">
                  查看文档
                </button>
                <button type="button" onClick={() => openResumeContent(p)} disabled={busyId === p.id} className="btn flex-1">
                  <IconResume width={14} height={14} />
                  简历内容
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!viewer} onClose={() => setViewer(null)} title={viewer?.title ?? ""} wide>
        <pre
          className="whitespace-pre-wrap break-words rounded border p-4 font-mono text-[0.78rem] leading-relaxed"
          style={{ borderColor: "var(--rule)", background: "var(--surface-sunken)" }}
        >
          {viewer?.body}
        </pre>
      </Modal>
    </div>
  );
}
