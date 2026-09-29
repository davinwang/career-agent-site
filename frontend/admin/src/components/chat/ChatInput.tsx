import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ChangeEvent, DragEvent } from "react";
import { api } from "../../lib/api";
import type { UploadOriginal } from "../../types/api";
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
  placeholder = "输入消息，Enter 发送 / Shift+Enter 换行…（也可直接拖入文件）",
}: Props) {
  const [value, setValue] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadOriginal[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Counts nested dragenter/dragleave pairs so the overlay doesn't flicker.
  const dragDepth = useRef(0);

  // Load the upload list lazily when the reference picker opens.
  useEffect(() => {
    if (!pickerOpen || uploads.length > 0) return;
    api
      .listUploads()
      .then((r) => setUploads(r.uploads))
      .catch(() => setUploads([]));
  }, [pickerOpen, uploads.length]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || busy) return;
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

  const reference = (u: UploadOriginal) => {
    setValue((v) => {
      const snippet = `请结合附件「${u.original_name}」`;
      return v.includes(snippet) ? v : v ? `${snippet}，${v}` : `${snippet}回答：`;
    });
    setPickerOpen(false);
    areaRef.current?.focus();
  };

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
    if (!onAttach || disabled) return;
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
    if (!onAttach || disabled || busy) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    void uploadFiles(files);
  };

  return (
    <div className="relative">
      {/* Attachment reference picker */}
      {pickerOpen && (
        <div
          className="absolute bottom-full left-0 z-10 mb-2 w-72 rounded-lg border p-2 shadow-lg"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label text-[0.6rem]">引用已上传的附件</span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="关闭引用选择"
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <IconClose width={13} height={13} />
            </button>
          </div>
          {uploads.length === 0 ? (
            <div className="py-3 text-center text-xs text-[var(--text-muted)]">
              还没有上传过附件（图片等直接上传的文件不在此列表）
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
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
              松开以上传附件
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
              disabled={attaching || disabled}
              aria-label="添加附件"
              title="上传文件"
              className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
            >
              {attaching ? <IconSpinner width={18} height={18} /> : <IconPaperclip width={18} height={18} />}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={disabled || busy}
          aria-label="引用已上传的附件"
          title="引用已上传的附件"
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
          style={{ color: pickerOpen ? "var(--accent)" : undefined }}
        >
          <span className="text-[0.78rem] font-medium">引</span>
        </button>

        <textarea
          ref={areaRef}
          value={value}
          onChange={onInput}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          className="max-h-[180px] flex-1 resize-none bg-transparent px-1 py-2 text-[0.9rem] leading-relaxed outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
          style={{ color: "var(--text)" }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={disabled || busy || !value.trim()}
          aria-label="发送"
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md transition-all disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--color-paper-50)" }}
        >
          {busy ? <IconSpinner width={18} height={18} /> : <IconSend width={17} height={17} />}
        </button>
      </div>
    </div>
  );
}
