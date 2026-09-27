import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { KnowledgeItem } from "../types/api";
import { SectionHead, Card, Badge, Spinner, ErrorNote } from "../components/ui";
import { IconUpload, IconTrash, IconCheck, IconSpinner } from "../components/icons";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.json,.zip";

interface UploadRow {
  id: string;
  name: string;
  pct: number;
  status: "uploading" | "done" | "error";
  message?: string;
}

export default function Upload() {
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadKnowledge = useCallback(async () => {
    try {
      const r = await api.listKnowledge();
      setItems(r.knowledge ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载知识库失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  const patchRow = (id: string, patch: Partial<UploadRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const uploadOne = async (file: File) => {
    const id = `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (file.size > MAX_BYTES) {
      setRows((p) => [...p, { id, name: file.name, pct: 0, status: "error", message: "超过 50MB 限制" }]);
      return;
    }
    setRows((p) => [...p, { id, name: file.name, pct: 0, status: "uploading" }]);
    try {
      await api.uploadFile(file, (pct) => patchRow(id, { pct }));
      patchRow(id, { pct: 100, status: "done" });
      void loadKnowledge();
    } catch (err) {
      patchRow(id, { status: "error", message: err instanceof Error ? err.message : "上传失败" });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => void uploadOne(f));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDelete = async (id: string) => {
    try {
      await api.deleteKnowledge(id);
      setItems((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  return (
    <div className="space-y-8">
      <SectionHead title="文档上传" en="Knowledge ingestion" />

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-all"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--rule)",
          background: dragging ? "var(--accent-soft)" : "var(--surface)",
          transform: dragging ? "scale(1.01)" : "none",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span style={{ color: dragging ? "var(--accent)" : "var(--text-muted)" }}>
          <IconUpload width={36} height={36} />
        </span>
        <div>
          <div className="font-display text-base font-semibold">
            {dragging ? "松开以上传" : "拖拽文件到此处，或点击选择"}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            支持 PDF / DOCX / TXT / MD / JSON / ZIP · 单文件最大 50MB
          </div>
        </div>
      </div>

      {/* Active / recent uploads */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-3">
              <span style={{ color: r.status === "done" ? "var(--color-moss-500)" : r.status === "error" ? "var(--color-ember-500)" : "var(--accent)" }}>
                {r.status === "uploading" ? <IconSpinner width={16} height={16} /> : r.status === "done" ? <IconCheck width={16} height={16} /> : <IconTrash width={16} height={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{r.name}</span>
                  {r.status === "done" && <Badge tone="moss">已入库</Badge>}
                  {r.status === "error" && <Badge tone="warn">失败</Badge>}
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${r.status === "error" ? 100 : r.pct}%`,
                      background: r.status === "error" ? "var(--color-ember-500)" : "var(--accent)",
                    }}
                  />
                </div>
                {r.message && <div className="mt-1 text-[0.7rem] text-[var(--color-ember-500)]">{r.message}</div>}
              </div>
              <span className="label shrink-0 text-[0.58rem]">{r.status === "uploading" ? `${r.pct}%` : ""}</span>
            </Card>
          ))}
        </div>
      )}

      {error && <ErrorNote message={error} />}

      {/* Knowledge base list */}
      <section>
        <SectionHead title="知识库" en={`${items.length} document(s)`} />
        {loading ? (
          <Spinner label="加载知识库…" />
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--rule)" }}>
            知识库为空，上传文档后将在此显示
          </div>
        ) : (
          <Card className="divide-y overflow-hidden" style={{ borderColor: "var(--rule)" }}>
            {items.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{k.filename}</div>
                  <div className="label mt-0.5 text-[0.56rem]">
                    {new Date(k.created_at).toLocaleString("zh-CN")}
                  </div>
                </div>
                <Badge tone={k.source_type === "repo" ? "accent" : "neutral"}>{k.source_type}</Badge>
                <button
                  type="button"
                  onClick={() => onDelete(k.id)}
                  aria-label="删除"
                  className="focus-ring grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--color-ember-500)]"
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
