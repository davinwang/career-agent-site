import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ResumeData } from "../types/resume";
import ResumePreview from "../components/ResumePreview";
import { SectionHead, Spinner, ErrorNote } from "../components/ui";
import { IconDownload, IconEdit, IconSessions, IconCheck, IconSpinner } from "../components/icons";

type Mode = "preview" | "edit";
const DEFAULT_LANGS = ["zh", "en"];

export default function Resume() {
  const [langs, setLangs] = useState<string[]>(DEFAULT_LANGS);
  const [lang, setLang] = useState("zh");
  const [mode, setMode] = useState<Mode>("preview");
  const [data, setData] = useState<ResumeData | null>(null);
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Discover available languages once.
  useEffect(() => {
    api
      .getLanguages()
      .then((r) => {
        if (r.languages?.length) setLangs(r.languages);
      })
      .catch(() => {
        /* keep defaults when backend is offline */
      });
  }, []);

  const load = useCallback(async (l: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getResume(l);
      setData(res.data ?? null);
      setText(JSON.stringify(res.data ?? {}, null, 2));
      setUpdatedAt(res.updated_at);
    } catch (err) {
      setData(null);
      setText("");
      if (err instanceof ApiError && err.status === 404) {
        setNotice(`语言「${l}」暂无简历数据，可切换到编辑模式创建。`);
      } else {
        setError(err instanceof ApiError ? err.message : "加载简历失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNotice(null);
    void load(lang);
  }, [lang, load]);

  const switchLang = (l: string) => {
    setLang(l);
    setMode("preview");
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    let parsed: ResumeData;
    try {
      parsed = JSON.parse(text) as ResumeData;
    } catch (e) {
      setSaving(false);
      setError(`JSON 格式错误：${(e as Error).message}`);
      return;
    }
    try {
      await api.updateResume(lang, parsed);
      setData(parsed);
      setNotice("已保存 ✓");
      setMode("preview");
      void load(lang);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onDownloadPdf = async () => {
    setError(null);
    try {
      const blob = await api.downloadPdf(lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "PDF 下载失败");
    }
  };

  return (
    <div className="space-y-5">
      <SectionHead
        title="简历管理"
        en={updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString("zh-CN")}` : "Resume"}
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={onDownloadPdf} className="btn">
              <IconDownload width={15} height={15} /> PDF
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
              className="btn"
            >
              {mode === "edit" ? <IconSessions width={15} height={15} /> : <IconEdit width={15} height={15} />}
              {mode === "edit" ? "预览" : "编辑"}
            </button>
          </div>
        }
      />

      {/* Language tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {langs.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchLang(l)}
            className="rounded-md border px-3 py-1.5 font-mono text-xs transition-colors"
            style={{
              borderColor: lang === l ? "var(--accent)" : "var(--rule)",
              color: lang === l ? "var(--accent)" : "var(--text-muted)",
              background: lang === l ? "var(--accent-soft)" : "transparent",
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className="rounded-md border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--color-moss-500)", background: "color-mix(in srgb, var(--color-moss-500) 12%, transparent)" }}
        >
          {notice}
        </div>
      )}
      {error && <ErrorNote message={error} />}

      {loading ? (
        <Spinner label="加载简历…" />
      ) : mode === "preview" ? (
        data ? (
          <ResumePreview data={data} />
        ) : (
          <div className="rounded-lg border border-dashed py-16 text-center text-[var(--text-muted)]" style={{ borderColor: "var(--rule)" }}>
            该语言暂无简历数据
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="label text-[0.62rem]">JSON 编辑器 · {lang}</span>
            <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary">
              {saving ? <IconSpinner width={15} height={15} /> : <IconCheck width={15} height={15} />}
              保存
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="input min-h-[60vh] resize-y font-mono text-[0.8rem] leading-relaxed"
            style={{ background: "var(--surface-sunken)" }}
            placeholder="{ }"
          />
        </div>
      )}
    </div>
  );
}
