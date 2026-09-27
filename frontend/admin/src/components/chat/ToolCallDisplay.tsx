import { useState } from "react";
import type { ToolCall } from "../../hooks/useSession";
import { IconWrench, IconChevron, IconCheck, IconSpinner } from "../icons";

/** Pretty-print a value as JSON when possible, else stringify. */
function format(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function Block({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="label text-[0.56rem]">{label}</div>
      <pre
        className="mt-1 max-h-56 overflow-auto rounded border p-2 font-mono text-[0.72rem] leading-relaxed"
        style={{ borderColor: "var(--rule)", background: "var(--surface-sunken)" }}
      >
        {value}
      </pre>
    </div>
  );
}

/**
 * Collapsible indicator for a single agent tool invocation.
 * Shows a spinner while running, a check when done; args always visible,
 * result collapsed behind a second toggle.
 */
export default function ToolCallDisplay({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const running = call.status === "running";
  const args = format(call.args);
  const result = format(call.result);

  return (
    <div
      className="my-2 overflow-hidden rounded-md border"
      style={{
        borderColor: running ? "var(--accent)" : "var(--rule)",
        background: "var(--surface-sunken)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--accent-soft)]"
        aria-expanded={open}
      >
        <span style={{ color: running ? "var(--accent)" : "var(--text-muted)" }}>
          {running ? (
            <IconSpinner width={15} height={15} />
          ) : (
            <IconCheck width={15} height={15} />
          )}
        </span>
        <IconWrench width={14} height={14} style={{ color: "var(--text-muted)" }} />
        <span className="font-mono text-[0.75rem]">
          调用工具: <span className="accent-text font-bold">{call.name}</span>
        </span>
        {running && <span className="label text-[0.55rem]">执行中…</span>}
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          <IconChevron
            width={14}
            height={14}
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }}
          />
        </span>
      </button>

      {open && (
        <div className="border-t px-3 py-2" style={{ borderColor: "var(--rule)" }}>
          <Block label="Arguments" value={args || "（无参数）"} />
          {result ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowResult((s) => !s)}
                className="label flex items-center gap-1 text-[0.58rem] hover:text-[var(--accent)]"
              >
                <IconChevron
                  width={12}
                  height={12}
                  style={{ transform: showResult ? "rotate(90deg)" : "none" }}
                />
                Result
              </button>
              {showResult && <Block label="" value={result} />}
            </div>
          ) : (
            !running && <div className="label mt-2 text-[0.56rem]">无返回结果</div>
          )}
        </div>
      )}
    </div>
  );
}
