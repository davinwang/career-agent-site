import { useEffect, useState } from "react";
import { api, ApiError, API_BASE } from "../../lib/api";
import type { ResumeData } from "../../types/resume";
import type { UploadOriginal } from "../../types/api";
import ResumePreview from "../ResumePreview";
import { Badge, Spinner } from "../ui";
import { useT } from "../../lib/i18n";
import { useIsGuest } from "../../hooks/useIsGuest";
import {
  IconResume,
  IconUpload,
  IconProjects,
  IconSkills,
  IconSessions,
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
  uploads?: UploadOriginal[];
}

interface SessionItem {
  id: string;
  updated_at: string;
  created_at: string;
}

const GRID_CELLS = [
  { kind: "resume", labelKey: "artifacts.resume", enKey: "artifacts.resumeEn" },
  { kind: "knowledge", labelKey: "artifacts.docs", enKey: "artifacts.docsEn" },
  { kind: "projects", labelKey: "artifacts.projects", enKey: "artifacts.projectsEn" },
  { kind: "skills", labelKey: "artifacts.skills", enKey: "artifacts.skillsEn" },
  { kind: "sessions", labelKey: "chat.sessions", enKey: "chat.sessionList" },
] as const;

type CellKind = (typeof GRID_CELLS)[number]["kind"];

function countFor(a: Artifacts | null, kind: CellKind, sessionCount: number): number {
  if (kind === "sessions") return sessionCount;
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
    case "sessions":
      return IconSessions;
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

/** The artifact strip (five cells in one row) beside the chat. */
export default function ArtifactPanel({
  refreshKey,
  onAsk,
  onOpenChange,
  sessionCount = 0,
  activeSessionId = null,
  onSwitchSession,
}: {
  refreshKey: number;
  onAsk: (text: string) => void;
  /** Called when the user closes the detail view (used by the parent strip to collapse). */
  onOpenChange?: (open: boolean) => void;
  /** Number of admin sessions (for the 会话 cell badge). */
  sessionCount?: number;
  /** Currently active session id (highlights the sessions detail list). */
  activeSessionId?: string | null;
  /** Switch the chat to another session. */
  onSwitchSession?: (id: string) => void;
}) {
  const t = useT();
  // Combine parent refreshKey (assistant tool-call turns) with local bumps
  // (in-panel deletions) into one fetch key.
  const [localRefresh, setLocalRefresh] = useState(0);
  const fetchKey = refreshKey + localRefresh;
  const { data, loading } = useArtifacts(fetchKey);
  const bumpRefresh = () => setLocalRefresh((k) => k + 1);

  const [openKind, setOpenKind] = useState<CellKind | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="label text-[0.62rem]">{t("chat.archives")}</div>
        {loading && <IconSpinner width={14} height={14} />}
      </div>

      {/* Grid: five cells in a single row on PC; wraps to a grid on narrow widths */}
      <div className="grid grid-cols-5 gap-2 max-lg:grid-cols-3 max-sm:grid-cols-2">
        {GRID_CELLS.map((cell) => {
          const Icon = iconFor(cell.kind);
          const count = countFor(data, cell.kind, sessionCount);
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
              <span className="text-xs font-medium">{t(cell.labelKey)}</span>
              <span className="label text-[0.56rem]">{empty ? t("chat.pendingGen") : `${count}`}</span>
            </button>
          );
        })}
      </div>

      {/* Detail view for the opened cell */}
      {openKind && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "var(--rule)" }}>
          <Detail
            kind={openKind}
            data={data}
            onAsk={onAsk}
            onClose={() => { setOpenKind(null); onOpenChange?.(false); }}
            onRefresh={bumpRefresh}
            activeSessionId={activeSessionId}
            onSwitchSession={onSwitchSession}
          />
        </div>
      )}

      <p className="mt-3 text-[0.66rem] leading-relaxed text-[var(--text-muted)]">
        {t("chat.artifactsFooter")}
      </p>
    </div>
  );
}

function Detail({
  kind,
  data,
  onAsk,
  onClose,
  onRefresh,
  activeSessionId = null,
  onSwitchSession,
}: {
  kind: CellKind;
  data: Artifacts | null;
  onAsk: (text: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  activeSessionId?: string | null;
  onSwitchSession?: (id: string) => void;
}) {
  const t = useT();
  const cell = GRID_CELLS.find((c) => c.kind === kind)!;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="label text-[0.6rem]">
          {kind === "sessions" ? t(cell.enKey) : `${t(cell.labelKey)} · ${t(cell.enKey)}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("chat.closeDetail")}
          className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <IconClose width={15} height={15} />
        </button>
      </div>

      {!data ? (
        <Spinner label={t("chat.loadingShort")} />
      ) : kind === "resume" ? (
        <ResumeDetail resumes={data.resumes} uploads={data.uploads ?? []} onAsk={onAsk} onChanged={onRefresh} />
      ) : kind === "knowledge" ? (
        <KnowledgeDetail knowledge={data.knowledge} uploads={data.uploads ?? []} onChanged={onRefresh} />
      ) : kind === "projects" ? (
        <ListDetail
          items={data.projects.map((p) => ({
            id: p.id,
            title: p.name,
            sub: p.repo_url ? p.repo_url.replace(/^https?:\/\/(www\.)?github\.com\//, "") : "—",
            badge: p.repo_url ? t("artifacts.source") : t("artifacts.document"),
          }))}
          empty={t("artifacts.emptyProjects")}
          askText={t("artifacts.askProject")}
        />
      ) : kind === "skills" ? (
        <ListDetail
          items={data.skills.map((s) => ({
            id: s.id,
            title: s.name,
            sub: s.prompt.slice(0, 60) + (s.prompt.length > 60 ? "…" : ""),
            badge: s.enabled ? "on" : "off",
          }))}
          empty={t("artifacts.emptySkills")}
          askText={t("artifacts.askSkills")}
        />
      ) : (
        <SessionsDetail activeSessionId={activeSessionId} onSwitchSession={onSwitchSession} />
      )}
    </div>
  );
}

/** Admin chat sessions list — click a row to switch the conversation. */
function SessionsDetail({
  activeSessionId,
  onSwitchSession,
}: {
  activeSessionId?: string | null;
  onSwitchSession?: (id: string) => void;
}) {
  const t = useT();
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await api.listAdminSessions();
        if (active) setSessions(r.sessions ?? []);
      } catch {
        if (active) setSessions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!sessions) return <Spinner label={t("chat.loadingShort")} />;

  if (sessions.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--text-muted)]">{t("chat.noHistory")}</div>;
  }

  return (
    <div className="space-y-1.5">
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (!isActive) onSwitchSession?.(s.id);
            }}
            className="flex w-full items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors hover:border-[var(--accent)]"
            style={{
              borderColor: isActive ? "var(--accent)" : "var(--rule)",
              background: isActive ? "var(--accent-soft)" : undefined,
            }}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <IconSessions width={16} height={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.id}</span>
              <span className="label block text-[0.56rem]">{fmtSessionDate(s.updated_at)}</span>
            </span>
            {isActive && <span className="label shrink-0 text-[0.55rem]">{t("common.current")}</span>}
          </button>
        );
      })}
    </div>
  );
}

function fmtSessionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResumeDetail({
  resumes,
  uploads,
  onAsk,
  onChanged,
}: {
  resumes: { lang: string; name: string | null; photo: string | null }[];
  uploads: UploadOriginal[];
  onAsk: (t: string) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const isGuest = useIsGuest();
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
            {t("common.backToList")}
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
          {t("artifacts.emptyResumes")}
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
            <div className="truncate text-sm font-medium">{r.name ?? t("common.unnamed")}</div>
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
            {t("common.preview")}
          </button>
          {!isGuest && (
            <button
              type="button"
              onClick={() => download(r.lang)}
              disabled={downloading === r.lang}
              aria-label={`${t("common.download")} PDF`}
              className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              {downloading === r.lang ? <IconSpinner width={14} height={14} /> : <IconDownload width={15} height={15} />}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onAsk(t("artifacts.genEnResume"))}
        className="label mt-1 w-full rounded-md border border-dashed py-2 text-[0.6rem] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ borderColor: "var(--rule)" }}
      >
        {t("artifacts.newLangVersion")}
      </button>
      <UploadsSection uploads={uploads} onChanged={onChanged} />
    </div>
  );
}

/** Uploaded originals (e.g. multiple PDF resume versions) with download/delete. */
function UploadsSection({
  uploads,
  onChanged,
}: {
  uploads: UploadOriginal[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT();
  const isGuest = useIsGuest();
  if (uploads.length === 0) return null;

  const remove = async (u: UploadOriginal) => {
    if (!window.confirm(t("artifacts.deleteUploadConfirm", u.original_name))) return;
    setBusy(u.stored_name);
    try {
      await api.deleteUpload(u.stored_name);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pt-2">
      <div className="label mb-1.5 text-[0.58rem]">{t("artifacts.uploadsTitle", uploads.length)}</div>
      <div className="space-y-1.5">
        {uploads.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.72rem] font-medium">{u.original_name}</div>
              <div className="label text-[0.52rem]">
                {(u.size / 1024).toFixed(0)} KB · {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            {!isGuest && (
              <button
                type="button"
                onClick={() => api.downloadUpload(u.stored_name, u.original_name)}
                aria-label={t("artifacts.downloadOriginal", u.original_name)}
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                <IconDownload width={13} height={13} />
              </button>
            )}
            {!isGuest && (
              <button
                type="button"
                onClick={() => remove(u)}
                disabled={busy === u.stored_name}
                aria-label={t("artifacts.deleteOriginal", u.original_name)}
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-red-500"
              >
                {busy === u.stored_name ? <IconSpinner width={13} height={13} /> : <IconClose width={13} height={13} />}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[0.56rem] text-[var(--text-muted)]">
        {t("artifacts.uploadsNote")}
      </p>
    </div>
  );
}

/** Knowledge entries with original-file download + entry delete. */
function KnowledgeDetail({
  knowledge,
  uploads,
  onChanged,
}: {
  knowledge: { id: string; filename: string; source_type: string; created_at: string; excerpt: string }[];
  uploads: UploadOriginal[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT();
  const isGuest = useIsGuest();

  if (knowledge.length === 0 && uploads.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--text-muted)]">{t("artifacts.emptyKnowledge")}</div>;
  }

  // knowledge.filename usually equals the original upload name — link it to a
  // stored original for the download button when possible.
  const storedFor = (filename: string) =>
    uploads.find((u) => u.original_name === filename || u.stored_name === filename);

  const removeEntry = async (id: string, title: string) => {
    if (!window.confirm(t("artifacts.deleteKnowledgeConfirm", title))) return;
    setBusy(id);
    try {
      await api.deleteKnowledge(id);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {knowledge.map((k) => {
        const stored = storedFor(k.filename);
        return (
          <div
            key={k.id}
            className="flex items-center gap-2 rounded-md border px-2.5 py-2"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8rem] font-medium">{k.filename}</div>
              <div className="label truncate text-[0.54rem]">
                {k.source_type} · {new Date(k.created_at).toLocaleDateString()}
              </div>
            </div>
            {stored && !isGuest && (
              <button
                type="button"
                onClick={() => api.downloadUpload(stored.stored_name, stored.original_name)}
                aria-label={t("artifacts.downloadOriginal", stored.original_name)}
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                <IconDownload width={13} height={13} />
              </button>
            )}
            {!isGuest && (
              <button
                type="button"
                onClick={() => removeEntry(k.id, k.filename)}
                disabled={busy === k.id}
                aria-label={t("artifacts.deleteOriginal", k.filename)}
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-red-500"
              >
                {busy === k.id ? <IconSpinner width={13} height={13} /> : <IconClose width={13} height={13} />}
              </button>
            )}
          </div>
        );
      })}
      <div className="pt-1 text-center text-[0.6rem] text-[var(--text-muted)]">
        {t("artifacts.knowledgeModifyHint")}
      </div>
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
  const t = useT();
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
        {t("artifacts.modifyHint", askText)}
      </div>
    </div>
  );
}
