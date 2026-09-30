import { Fragment } from "react";
import type { ChatMessage } from "../../hooks/useSession";
import ToolCallDisplay from "./ToolCallDisplay";
import { useT } from "../../lib/i18n";

/** Very light markdown: ```code fences``` and `inline code`. No deps. */
function renderContent(text: string) {
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Inside a fence — first token may be a language hint.
      const nl = part.indexOf("\n");
      const body = nl >= 0 ? part.slice(nl + 1) : part;
      return (
        <pre
          key={i}
          className="my-2 overflow-auto rounded-md border p-3 font-mono text-[0.78rem] leading-relaxed"
          style={{ borderColor: "var(--rule)", background: "var(--surface-sunken)" }}
        >
          {body}
        </pre>
      );
    }
    // Inline code segments.
    const bits = part.split(/(`[^`]+`)/g);
    return (
      <Fragment key={i}>
        {bits.map((bit, j) =>
          bit.startsWith("`") && bit.endsWith("`") && bit.length > 2 ? (
            <code
              key={j}
              className="rounded px-1 py-0.5 font-mono text-[0.82em]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {bit.slice(1, -1)}
            </code>
          ) : (
            <Fragment key={j}>{bit}</Fragment>
          ),
        )}
      </Fragment>
    );
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const t = useT();
  const isUser = message.role === "user";

  return (
    <div className={`rise flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-xs font-bold"
        style={{
          background: isUser ? "var(--accent)" : "var(--ink-700, #262019)",
          color: "var(--color-paper-50)",
        }}
      >
        {isUser ? t("chat.me") : "AI"}
      </div>

      <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {message.toolCalls.length > 0 && (
          <div className="w-full">
            {message.toolCalls.map((c) => (
              <ToolCallDisplay key={c.id} call={c} />
            ))}
          </div>
        )}

        {(message.content || message.streaming) && (
          <div
            className="rounded-lg border px-4 py-2.5 text-[0.9rem] leading-relaxed"
            style={{
              borderColor: isUser ? "var(--accent)" : "var(--rule)",
              background: isUser ? "var(--accent-soft)" : "var(--surface)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {renderContent(message.content)}
            {message.streaming && (
              <span
                className="dot ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5"
                style={{ background: "var(--accent)" }}
              />
            )}
          </div>
        )}

        <span className="label mt-1 px-1 text-[0.55rem]">{fmtTime(message.createdAt)}</span>
      </div>
    </div>
  );
}
