import { useEffect, useRef, useState } from "react";
import { useSession } from "../../hooks/useSession";
import { api } from "../../lib/api";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import ArtifactPanel from "./ArtifactPanel";
import { ErrorNote, EmptyState } from "../ui";
import { IconChat, IconChevron } from "../icons";

const SUGGESTIONS = [
  "我有一份旧简历，先给你看看哪里需要更新",
  "帮我分析一个项目的源码仓库，提炼简历条目",
  "我想往 AI 架构方向转型，帮我评估和规划",
];

export default function ChatPanel() {
  const { messages, loadingHistory, streaming, error, send, stop, clear, setError } =
    useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // Refresh the artifact panel whenever a tool call completes (assistant turn
  // finished) — cheap and always fresh after writes.
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.streaming && last.toolCalls.length > 0) {
      setRefreshKey((k) => k + 1);
    }
  }, [messages]);

  // Auto-scroll to the newest content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const handleAttach = async (file: File) => {
    try {
      const res = await api.uploadFile(file);
      const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      const note = isImage
        ? `我上传了图片「${res.original_name}」（已存储为 ${res.stored_name}）。如果适合作为简历/公司 logo 照片，请把它设置到简历 photo 字段（用 /uploads/${res.stored_name}）。`
        : `我上传了文件「${res.original_name}」（已存储为 ${res.stored_name}），请用 ingestFile 解析并纳入知识库。`;
      await send(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件上传失败");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="label text-[0.62rem]">求职导师 · Career Mentor</div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="label text-[0.6rem] hover:text-[var(--accent)]"
            >
              清空当前视图
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="label flex items-center gap-1 text-[0.6rem] hover:text-[var(--accent)] xl:hidden"
          >
            成果
            <IconChevron
              width={12}
              height={12}
              style={{ transform: panelOpen ? "rotate(180deg)" : "none" }}
            />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-lg border px-3 py-4 sm:px-5"
            style={{ borderColor: "var(--rule)", background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}
          >
            {error && (
              <div className="mb-2">
                <ErrorNote message={error} />
              </div>
            )}

            {loadingHistory ? (
              <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
                <span className="label">加载历史消息…</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5">
                <EmptyState
                  icon={<IconChat width={40} height={40} />}
                  title="和你的求职导师聊聊"
                  hint="上传简历、补充材料、分析项目、规划转型 —— 一切通过对话完成，成果在右侧展示。"
                />
                <div className="flex w-full max-w-md flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{ borderColor: "var(--rule)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
          </div>

          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <ChatInput onSend={send} onAttach={handleAttach} busy={streaming} />
            </div>
            {streaming && (
              <button type="button" onClick={stop} className="btn shrink-0">
                停止
              </button>
            )}
          </div>
        </div>

        {/* Artifact column: visible ≥xl always, toggleable below */}
        <div
          className={`min-h-0 shrink-0 ${panelOpen ? "block" : "hidden"} xl:block`}
          style={{ width: "min(20rem, 30%)" }}
        >
          <div
            className="h-full rounded-lg border p-3"
            style={{ borderColor: "var(--rule)", background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}
          >
            <ArtifactPanel refreshKey={refreshKey} onAsk={send} />
          </div>
        </div>
      </div>
    </div>
  );
}
