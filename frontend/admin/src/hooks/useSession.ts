import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE, getToken, ApiError } from "../lib/api";
import { parseSSE } from "../lib/sse";

export interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  result?: unknown;
  status: "running" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
  createdAt: string;
  streaming?: boolean;
}

function uuid(): string {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Normalise a persisted DB message row into the UI chat model. */
function fromRow(row: {
  id: number;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}): ChatMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  let toolCalls: ToolCall[] = [];
  if (row.tool_calls) {
    try {
      const parsed =
        typeof row.tool_calls === "string" ? JSON.parse(row.tool_calls) : row.tool_calls;
      if (Array.isArray(parsed)) {
        toolCalls = parsed.map((t: Record<string, unknown>, i: number) => ({
          id: String(t.id ?? `${row.id}-${i}`),
          name: String(t.name ?? t.tool ?? "tool"),
          args: t.args ?? t.arguments,
          result: t.result,
          status: "done" as const,
        }));
      }
    } catch {
      /* ignore malformed tool_calls */
    }
  }
  return {
    id: `db-${row.id}`,
    role: row.role,
    content: row.content,
    toolCalls,
    createdAt: row.created_at,
  };
}

export function useSession() {
  // Session identity lives server-side (keyed to the logged-in user), so the
  // same account sees the same chat history from any browser/device. Multiple
  // chats are supported: switchSession()/newSession() swap the active id.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve the server-side current session, then load its history.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { session } = await api.getCurrentSession();
        if (!active) return;
        setSessionId(session.id);
      } catch (err) {
        if (active && err instanceof ApiError && err.status !== 401) {
          setError(err.message);
        }
        if (active) setLoadingHistory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load persisted history once the session id is known.
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    (async () => {
      try {
        const { messages: rows } = await api.getSessionMessages(sessionId);
        if (!active) return;
        const mapped = rows
          .map(fromRow)
          .filter((m): m is ChatMessage => m !== null);
        setMessages(mapped);
      } catch (err) {
        // A missing session (404) simply means "no history yet" — stay quiet.
        if (active && err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const patchLast = useCallback((updater: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    patchLast((m) => ({ ...m, streaming: false }));
  }, [patchLast]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming || !sessionId) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: uuid(),
        role: "user",
        content: trimmed,
        toolCalls: [],
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: "",
        toolCalls: [],
        createdAt: new Date().toISOString(),
        streaming: true,
      };

      // History sent to the agent excludes the placeholder assistant turn.
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/ag-ui/admin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messages: history, threadId: sessionId }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new ApiError(`Agent 请求失败 (${res.status})`, res.status);
        }

        for await (const evt of parseSSE(res)) {
          switch (evt.type) {
            case "TEXT_MESSAGE_CONTENT": {
              const d = evt.delta;
              if (d) patchLast((m) => ({ ...m, content: m.content + d }));
              break;
            }
            case "TOOL_CALL_START":
              patchLast((m) => ({
                ...m,
                toolCalls: [
                  ...m.toolCalls,
                  {
                    id: evt.toolCallId ?? uuid(),
                    name: evt.toolName ?? "tool",
                    args: evt.toolArgs,
                    status: "running",
                  },
                ],
              }));
              break;
            case "TOOL_CALL_ARGS":
              patchLast((m) => {
                const calls = m.toolCalls.slice();
                const last = calls[calls.length - 1];
                if (last) {
                  const chunk = typeof evt.delta === "string" ? evt.delta : "";
                  const prev = typeof last.args === "string" ? last.args : "";
                  last.args = prev + chunk;
                }
                return { ...m, toolCalls: calls };
              });
              break;
            case "TOOL_CALL_END":
              patchLast((m) => {
                const calls = m.toolCalls.slice();
                const idx = evt.toolCallId
                  ? calls.findIndex((c) => c.id === evt.toolCallId)
                  : calls.length - 1;
                if (idx >= 0) {
                  calls[idx] = {
                    ...calls[idx],
                    result: evt.toolResult ?? calls[idx].result,
                    status: "done",
                  };
                }
                return { ...m, toolCalls: calls };
              });
              break;
            case "RUN_ERROR":
              setError(String(evt.delta ?? "Agent 运行出错"));
              break;
            case "RUN_FINISHED":
              // handled after loop
              break;
            default:
              break;
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const message = err instanceof ApiError ? err.message : "无法连接到 Agent 服务";
          setError(message);
          patchLast((m) =>
            m.content ? { ...m, streaming: false } : { ...m, content: `⚠ ${message}`, streaming: false },
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        patchLast((m) => ({ ...m, streaming: false }));
      }
    },
    [messages, streaming, sessionId, patchLast],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /** Load a different existing session's history into the view. */
  const switchSession = useCallback((id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setError(null);
    setLoadingHistory(true);
    setSessionId(id);
  }, []);

  /** Create a fresh server-side admin chat and make it the active one. */
  const newSession = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setError(null);
    try {
      const { session } = await api.newCurrentSession();
      setLoadingHistory(true);
      setSessionId(session.id);
      return session.id;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新建会话失败");
      return null;
    }
  }, []);

  return {
    sessionId,
    messages,
    loadingHistory,
    streaming,
    error,
    send,
    stop,
    clear,
    switchSession,
    newSession,
    setError,
  };
}
