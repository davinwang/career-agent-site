import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Session, Message } from "../types/api";
import { SectionHead, Card, Badge, Spinner, ErrorNote, EmptyState } from "../components/ui";
import { IconSessions, IconSearch } from "../components/icons";

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-CN");
}

/** Read-only transcript renderer for a recruiter session. */
function Transcript({ messages, loading }: { messages: Message[]; loading: boolean }) {
  if (loading) return <Spinner label="加载对话记录…" />;
  if (messages.length === 0)
    return <div className="py-10 text-center text-sm text-[var(--text-muted)]">该会话暂无消息</div>;

  return (
    <div className="space-y-4">
      {messages.map((m) => {
        const isUser = m.role === "user";
        const isMeta = m.role === "system" || m.role === "tool";
        if (isMeta) {
          return (
            <div key={m.id} className="flex items-center gap-2 text-[0.7rem] text-[var(--text-muted)]">
              <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
              <span className="font-mono">{m.role}</span>
              <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
            </div>
          );
        }
        return (
          <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
            <div
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-[0.65rem] font-bold"
              style={{
                background: isUser ? "var(--accent)" : "var(--ink-700,#262019)",
                color: "var(--color-paper-50)",
              }}
            >
              {isUser ? "猎" : "AI"}
            </div>
            <div className={`min-w-0 max-w-[80%] ${isUser ? "text-right" : ""}`}>
              <div
                className="inline-block whitespace-pre-wrap break-words rounded-lg border px-3.5 py-2 text-left text-[0.86rem] leading-relaxed"
                style={{
                  borderColor: isUser ? "var(--accent)" : "var(--rule)",
                  background: isUser ? "var(--accent-soft)" : "var(--surface)",
                }}
              >
                {m.content}
              </div>
              <div className="label mt-1 px-1 text-[0.52rem]">{fmt(m.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.listSessions("recruiter");
      setSessions(r.sessions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载会话失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSession = async (id: string) => {
    setSelected(id);
    setLoadingMsgs(true);
    try {
      const r = await api.getSessionMessages(id);
      setMessages(r.messages ?? []);
    } catch (err) {
      setMessages([]);
      setError(err instanceof ApiError ? err.message : "加载消息失败");
    } finally {
      setLoadingMsgs(false);
    }
  };

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.created_at.toLowerCase().includes(q) ||
      s.updated_at.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <SectionHead title="猎头会话" en={`${sessions.length} recruiter session(s)`} />

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <IconSearch width={16} height={16} />
        </span>
        <input
          className="input pl-9"
          placeholder="按会话 ID 或日期筛选…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <ErrorNote message={error} />}

      {loading ? (
        <Spinner label="加载会话…" />
      ) : sessions.length === 0 ? (
        <EmptyState icon={<IconSessions width={40} height={40} />} title="暂无猎头会话" hint="当猎头开始对话后会在此显示" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
          {/* Session list */}
          <Card className="max-h-[70vh] divide-y overflow-y-auto" style={{ borderColor: "var(--rule)" }}>
            {filtered.map((s) => {
              const active = selected === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s.id)}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors"
                  style={{ background: active ? "var(--accent-soft)" : "transparent" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs" style={{ color: active ? "var(--accent)" : "var(--text)" }}>
                      {shortId(s.id)}
                    </span>
                    <Badge tone={active ? "accent" : "neutral"}>{s.side}</Badge>
                  </div>
                  <div className="label text-[0.55rem]">创建 {fmt(s.created_at)}</div>
                  <div className="label text-[0.55rem]">活跃 {fmt(s.updated_at)}</div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">无匹配会话</div>
            )}
          </Card>

          {/* Transcript */}
          <Card className="max-h-[70vh] overflow-y-auto p-4 sm:p-5" style={{ borderColor: "var(--rule)" }}>
            {selected ? (
              <>
                <div className="mb-4 flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--rule)" }}>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{selected}</span>
                  <Badge tone="neutral">只读</Badge>
                </div>
                <Transcript messages={messages} loading={loadingMsgs} />
              </>
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                <IconSessions width={34} height={34} />
                <span className="text-sm">选择左侧会话查看对话记录</span>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
