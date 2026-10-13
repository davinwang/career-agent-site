import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ChangeEvent, DragEvent } from "react";
import { api } from "../../lib/api";
import type { UploadOriginal } from "../../types/api";
import type { ResumeData } from "../../types/resume";
import { useT } from "../../lib/i18n";
import { useIsGuest } from "../../hooks/useIsGuest";
import { IconSend, IconPaperclip, IconSpinner, IconClose } from "../icons";

interface Props {
  onSend: (text: string) => void;
  onAttach?: (file: File) => Promise<string | void> | string | void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}

const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.json,.zip,.png,.jpg,.jpeg,.webp,.gif";

export default function ChatInput({
  onSend,
  onAttach,
  disabled,
  busy,
}: Props) {
  const t = useT();
  const isGuest = useIsGuest();
  // Guests cannot chat: the whole input renders as a read-only notice.
  const readOnly = disabled || isGuest;
  const [value, setValue] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadOriginal[]>([]);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const { lang } = useT();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Counts nested dragenter/dragleave pairs so the overlay doesn't flicker.
  const dragDepth = useRef(0);

  // Load the upload list + current-language résumé lazily when the picker opens.
  useEffect(() => {
    if (!pickerOpen) return;
    if (uploads.length === 0) {
      api
        .listUploads()
        .then((r) => setUploads(r.uploads))
        .catch(() => setUploads([]));
    }
    api
      .getResume(lang)
      .then((env) => setResumeData(env.data ?? null))
      .catch(() => setResumeData(null));
  }, [pickerOpen]);

  const submit = () => {
    const text = value.trim();
    if (!text || readOnly || busy) return;
    onSend(text);
    setValue("");
    if (areaRef.current) areaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  // Unified `[@标签：名称]` reference snippets (same format as the recruiter end).
  const insertRef = (snippet: string) => {
    setValue((v) => (v.includes(snippet) ? v : v ? `${v} ${snippet}` : `${snippet} `));
    setPickerOpen(false);
    areaRef.current?.focus();
  };

  const reference = (u: UploadOriginal) => {
    insertRef(`[@${t("input.refGroupAttach")}：${u.original_name}]`);
  };

  // Resume reference entries: one per section item, plus summary/skills.
  const resumeRefs = (() => {
    if (!resumeData) return [] as { label: string; snippet: string }[];
    const refs: { label: string; snippet: string }[] = [];
    if (resumeData.summary) refs.push({ label: t("input.refSummary"), snippet: `[@${t("input.refSummary")}]` });
    (resumeData.experience ?? []).forEach((e) => {
      const role = (e as { role?: string; position?: string }).position ?? e.role ?? "";
      refs.push({ label: `${e.company ?? ""} · ${role}`.replace(/ · $/, ""), snippet: `[@${t("input.refExperience")}：${e.company ?? ""} ${role}]` });
    });
    (resumeData.projects ?? []).forEach((p) =>
      refs.push({ label: p.name ?? "", snippet: `[@${t("input.refProject")}：${p.name ?? ""}]` }),
    );
    (resumeData.education ?? []).forEach((e) =>
      refs.push({ label: `${e.school ?? ""} ${e.degree ?? ""}`.trim(), snippet: `[@${t("input.refEducation")}：${e.school ?? ""}]` }),
    );
    if (Object.keys(resumeData.skills ?? {}).length > 0)
      refs.push({ label: t("input.refSkills"), snippet: `[@${t("input.refSkills")}]` });
    return refs;
  })();

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0 || !onAttach) return;
    setAttaching(true);
    try {
      for (const f of files) await onAttach(f);
    } finally {
      setAttaching(false);
    }
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!onAttach || readOnly) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // allow drop
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!onAttach) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!onAttach || readOnly || busy) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    void uploadFiles(files);
  };

  return (
    <div className="relative">
      {/* Unified reference picker: résumé sections + attachments */}
      {pickerOpen && (
        <div
          className="absolute bottom-full left-0 z-10 mb-2 w-72 rounded-lg border p-2 shadow-lg"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label text-[0.6rem]">{t("input.refTitle")}</span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label={t("input.closePicker")}
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <IconClose width={13} height={13} />
            </button>
          </div>

          {resumeRefs.length > 0 && (
            <>
              <div className="label mb-1 mt-1 text-[0.55rem]">{t("input.refGroupResume")}</div>
              <div className="max-h-44 space-y-0.5 overflow-y-auto">
                {resumeRefs.map((r) => (
                  <button
                    key={r.snippet}
                    type="button"
                    onClick={() => insertRef(r.snippet)}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[0.74rem] transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="label mb-1 mt-2 text-[0.55rem]">{t("input.refGroupAttach")}</div>
          {uploads.length === 0 ? (
            <div className="py-2 text-center text-xs text-[var(--text-muted)]">
              {t("input.noUploads")}
            </div>
          ) : (
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {uploads.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => reference(u)}
                  className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <div className="truncate text-[0.74rem] font-medium">{u.original_name}</div>
                  <div className="label text-[0.52rem]">
                    {(u.size / 1024).toFixed(0)} KB · {new Date(u.created_at).toLocaleDateString("zh-CN")}
                  </div>
                </button>
              ))}
            </div>
          )}

          {resumeRefs.length === 0 && uploads.length === 0 && (
            <div className="py-3 text-center text-xs text-[var(--text-muted)]">{t("input.refEmpty")}</div>
          )}
        </div>
      )}

      <div
        className="relative flex items-end gap-2 rounded-lg border p-2 transition-colors focus-within:border-[var(--accent)]"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--rule)",
          background: dragging ? "var(--accent-soft)" : "var(--surface)",
        }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed"
            style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--surface) 80%, transparent)" }}
          >
            <span className="label text-[0.68rem]" style={{ color: "var(--accent)" }}>
              {t("input.dropToUpload")}
            </span>
          </div>
        )}
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length === 0 || !onAttach) return;
                setAttaching(true);
                try {
                  for (const f of files) await onAttach(f);
                } finally {
                  setAttaching(false);
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attaching || readOnly}
              aria-label={t("input.attach")}
              title={t("input.uploadFile")}
              className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
            >
              {attaching ? <IconSpinner width={18} height={18} /> : <IconPaperclip width={18} height={18} />}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={readOnly || busy}
          aria-label={t("input.reference")}
          title={t("input.reference")}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
          style={{ color: pickerOpen ? "var(--accent)" : undefined }}
        >
          <span className="text-[0.78rem] font-medium">{t("input.refBadge")}</span>
        </button>

        <textarea
          ref={areaRef}
          value={value}
          onChange={onInput}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={readOnly}
          placeholder={isGuest ? t("input.guestPlaceholder") : t("input.placeholder")}
          className="max-h-[180px] flex-1 resize-none bg-transparent px-1 py-2 text-[0.9rem] leading-relaxed outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
          style={{ color: "var(--text)" }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={readOnly || busy || !value.trim()}
          aria-label={t("input.send")}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md transition-all disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--color-paper-50)" }}
        >
          {busy ? <IconSpinner width={18} height={18} /> : <IconSend width={17} height={17} />}
        </button>
      </div>
    </div>
  );
}
