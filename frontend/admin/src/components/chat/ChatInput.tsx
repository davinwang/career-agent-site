import { useRef, useState } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { IconSend, IconPaperclip, IconSpinner } from "../icons";

interface Props {
  onSend: (text: string) => void;
  onAttach?: (file: File) => Promise<string | void> | string | void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  onAttach,
  disabled,
  busy,
  placeholder = "输入消息，Enter 发送 / Shift+Enter 换行…",
}: Props) {
  const [value, setValue] = useState("");
  const [attaching, setAttaching] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttach) return;
    setAttaching(true);
    try {
      await onAttach(file);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div
      className="flex items-end gap-2 rounded-lg border p-2 transition-colors focus-within:border-[var(--accent)]"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      {onAttach && (
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
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
  );
}
