import { useCallback, useEffect, useRef, useState } from 'react';
import {
  API_BASE,
  createSseParser,
  ensureSession,
  fetchSessionMessages,
  newId,
  sendChatMessage,
  streamResponse,
} from '../lib/api';
import type { ChatMessage } from '../types/resume';

export type ChatStatus = 'connecting' | 'idle' | 'streaming' | 'error';

export interface UseChatResult {
  messages: ChatMessage[];
  status: ChatStatus;
  /** set when the transcript could not be loaded — non-fatal */
  historyError: string | null;
  /** set when the last send failed */
  sendError: string | null;
  send: (text: string) => void;
  stop: () => void;
  clear: () => void;
}

/** Best-effort persistence; never blocks the UI. */
function archive(sessionId: string, role: 'user' | 'assistant', content: string): void {
  if (!sessionId || !content.trim()) return;
  fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ role, content }),
  }).catch(() => undefined);
}

/**
 * Streaming chat against the AG-UI recruiter endpoint.
 *
 * Transport: `POST /ag-ui/recruiter` returning `text/event-stream`. The parser
 * understands the AG-UI event vocabulary (`TEXT_MESSAGE_START` /
 * `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` / `RUN_*`) and degrades to plain
 * JSON when the server answers with a non-streaming body.
 */
export function useChat(sessionId: string): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef<string>('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /* ------------------------------------------------------- load history -- */
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    setStatus('connecting');
    setHistoryError(null);
    setMessages([]);

    void (async () => {
      await ensureSession(sessionId).catch(() => false);
      if (cancelled) return;
      try {
        const rows = await fetchSessionMessages(sessionId);
        if (cancelled) return;
        const restored: ChatMessage[] = rows
          .filter((r) => r.role === 'user' || r.role === 'assistant')
          .filter((r) => typeof r.content === 'string' && r.content.trim() !== '')
          .map((r) => ({
            id: `hist_${r.id}`,
            role: r.role,
            content: r.content,
            createdAt: r.created_at,
          }));
        setMessages(restored);
      } catch (err) {
        if (cancelled) return;
        // A missing session (404) is normal for a brand-new visitor.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/not found|404/i.test(msg)) setHistoryError(msg);
      } finally {
        if (!cancelled) setStatus('idle');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* ------------------------------------------------------------ helpers -- */
  const patchLast = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice();
      const last = next[next.length - 1];
      if (!last) return prev;
      next[next.length - 1] = updater(last);
      return next;
    });
  }, []);

  const appendDelta = useCallback(
    (delta: string) => {
      liveRef.current += delta;
      const snapshot = liveRef.current;
      patchLast((m) => (m.role === 'assistant' ? { ...m, content: snapshot } : m));
    },
    [patchLast],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
    if (mounted.current) setStatus((s) => (s === 'streaming' ? 'idle' : s));
  }, [patchLast]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    liveRef.current = '';
    setMessages([]);
    setSendError(null);
    if (mounted.current) setStatus('idle');
  }, []);

  /* --------------------------------------------------------------- send -- */
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = { id: newId('u'), role: 'user', content: text };
      const botMsg: ChatMessage = {
        id: newId('a'),
        role: 'assistant',
        content: '',
        streaming: true,
      };

      setSendError(null);
      setMessages((prev) => {
        const history = prev
          .filter((m) => !m.error)
          .map((m) => (m.streaming ? { ...m, streaming: false } : m));
        return [...history, userMsg, botMsg];
      });
      setStatus('streaming');
      liveRef.current = '';

      const outbound = [...messages.filter((m) => !m.error), userMsg].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }));

      void (async () => {
        archive(sessionId, 'user', text);
        let produced = '';
        let failed: string | null = null;

        try {
          const res = await sendChatMessage(sessionId, outbound, controller.signal);

          if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try {
              const body = (await res.json()) as { error?: unknown };
              if (body?.error) detail = String(body.error);
            } catch {
              /* keep the status line */
            }
            throw new Error(detail);
          }

          const contentType = res.headers.get('content-type') ?? '';

          if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
            // Non-streaming fallback: some runtimes answer with a single JSON body.
            const body = (await res.json()) as Record<string, unknown>;
            const flat =
              (typeof body.content === 'string' && body.content) ||
              (typeof body.message === 'string' && body.message) ||
              (typeof body.text === 'string' && body.text) ||
              '';
            if (flat) {
              produced += flat;
              appendDelta(flat);
            }
          } else {
            const parser = createSseParser((evt) => {
              const p = evt.payload as Record<string, unknown>;
              switch (evt.type) {
                case 'TEXT_MESSAGE_START':
                  liveRef.current = typeof p.content === 'string' ? p.content : '';
                  break;
                case 'TEXT_MESSAGE_CONTENT': {
                  const delta =
                    typeof p.delta === 'string'
                      ? p.delta
                      : typeof p.content === 'string'
                        ? p.content
                        : '';
                  if (delta) {
                    produced += delta;
                    appendDelta(delta);
                  }
                  break;
                }
                case 'TEXT_MESSAGE_END':
                  patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
                  break;
                case 'MESSAGES_SNAPSHOT': {
                  const snap = Array.isArray(p.messages) ? (p.messages as ChatMessage[]) : [];
                  if (snap.length) {
                    setMessages(
                      snap
                        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
                        .map((m, i) => ({
                          id: m.id ?? `snap_${i}`,
                          role: m.role,
                          content: typeof m.content === 'string' ? m.content : '',
                        })),
                    );
                  }
                  break;
                }
                case 'RUN_ERROR':
                  failed =
                    typeof p.message === 'string'
                      ? p.message
                      : typeof p.error === 'string'
                        ? p.error
                        : 'RUN_ERROR';
                  break;
                case 'RUN_FINISHED':
                  patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
                  break;
                case 'RAW':
                  // A `data:` line that was not JSON at all — some servers stream
                  // bare text. Treat it as a token rather than dropping it.
                  if (typeof p.delta === 'string' && p.delta) {
                    produced += p.delta;
                    appendDelta(p.delta);
                  }
                  break;
                default: {
                  // Unknown vocabulary. Structural AG-UI events (tool calls,
                  // steps, state deltas) carry non-prose payloads, so only pick
                  // text up from events we genuinely do not recognise.
                  const structural = /^(?:TOOL_CALL|STEP_|STATE_|RUN_)/.test(evt.type);
                  let stray = '';
                  if (!structural) {
                    stray =
                      typeof p.delta === 'string'
                        ? p.delta
                        : typeof p.content === 'string'
                          ? p.content
                          : '';
                  }
                  if (stray) {
                    produced += stray;
                    appendDelta(stray);
                  }
                  break;
                }
              }
            });

            await streamResponse(
              res,
              (chunk) => parser.push(chunk),
              controller.signal,
            );
            parser.end();
          }
        } catch (err) {
          if (controller.signal.aborted) {
            // user pressed stop — not an error
          } else {
            failed = err instanceof Error ? err.message : String(err);
          }
        } finally {
          abortRef.current = null;
          if (mounted.current) {
            const finalText = produced || liveRef.current;
            patchLast((m) => {
              if (m.role !== 'assistant') return m;
              if (failed && !finalText) {
                return { ...m, content: failed, streaming: false, error: true };
              }
              return { ...m, content: finalText, streaming: false };
            });

            // A run that produced nothing at all leaves no bubble behind. A
            // user-initiated stop is silent; anything else is surfaced.
            if (!finalText && !failed) {
              setMessages((prev) => prev.filter((m) => m.id !== botMsg.id));
              if (!controller.signal.aborted) setSendError('empty-response');
            } else if (failed && !finalText) {
              setSendError(failed);
            }

            if (finalText) archive(sessionId, 'assistant', finalText);
            setStatus('idle');
          }
        }
      })();
    },
    [appendDelta, messages, patchLast, sessionId],
  );

  return { messages, status, historyError, sendError, send, stop, clear };
}

export default useChat;
