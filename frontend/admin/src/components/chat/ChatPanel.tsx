import { useEffect, useRef } from "react";
import { useSession } from "../../hooks/useSession";
import { api } from "../../lib/api";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { ErrorNote, EmptyState } from "../ui";
import { IconChat } from "../icons";

const SUGGESTIONS = [
  "帮我更新简历里最近的项目经历",
  "分析我刚上传的文档并入库",
  "猎头最常问的技术问题有哪些？",
];

export default function ChatPanel() {
  const { messages, loadingHistory, streaming, error, send, stop, clear, setError } =
    useSession();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const handleAttach = async (file: File) => {
    try {
      const res = await api.uploadFile(file);
      await send(`我上传了文件「${res.original_name}」，请解析并纳入知识库。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件上传失败");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="label text-[0.62rem]">Admin Agent · 全权限</div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="label text-[0.6rem] hover:text-[var(--accent)]"
          >
            清空当前视图
          </button>
        )}
      </div>

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
              title="开始与管理端 Agent 对话"
              hint="它拥有全部工具权限：读写简历、上传入库、分析项目、管理提示词。"
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
  );
}
