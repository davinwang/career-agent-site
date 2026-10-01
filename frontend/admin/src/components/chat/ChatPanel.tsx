import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../hooks/useSession";
import { api } from "../../lib/api";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import ArtifactPanel from "./ArtifactPanel";
import { ErrorNote, EmptyState } from "../ui";
import { useT } from "../../lib/i18n";
import { useIsGuest } from "../../hooks/useIsGuest";
import { IconChat, IconChevron, IconResume } from "../icons";

interface SessionItem {
  id: string;
  updated_at: string;
  created_at: string;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Title of a chat = first user message (fetched lazily per open dropdown). */
async function fetchTitle(id: string, emptyTitle: string, unreadable: string): Promise<string> {
  try {
    const { messages } = await api.getSessionMessages(id);
    const first = messages.find((m) => m.role === "user");
    const text = first?.content?.trim() ?? "";
    return text ? (text.length > 24 ? `${text.slice(0, 24)}…` : text) : emptyTitle;
  } catch {
    return unreadable;
  }
}

export default function ChatPanel() {
  const t = useT();
  const isGuest = useIsGuest();
  const {
    sessionId, messages, loadingHistory, streaming, error,
    send, stop, switchSession, newSession, setError,
  } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Wide screens (PC): artifact drawer expanded by default; mobile: collapsed.
  const [artifactsOpen, setArtifactsOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  // Session list dropdown state.
  const [listOpen, setListOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Refresh the artifact panel whenever a tool call completes (assistant turn
  // finished) — cheap and always fresh after writes.
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.streaming && last.toolCalls.length > 0) {
      setRefreshKey((k) => k + 1);
    }
  }, [messages]);

  // Keep the session count fresh for the artifacts "会话" cell (cheap list-only
  // fetch; titles are only resolved for the open dropdown).
  const loadSessionCount = useCallback(async () => {
    try {
      const r = await api.listAdminSessions();
      setSessions(r.sessions ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);
  useEffect(() => {
    void loadSessionCount();
  }, [loadSessionCount, refreshKey, sessionId]);

  // Auto-scroll to the newest content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const loadSessions = useCallback(async () => {
    try {
      const r = await api.listAdminSessions();
      const items = (r.sessions ?? []).map((s) => ({
        id: s.id,
        updated_at: s.updated_at,
        created_at: s.created_at,
      }));
      setSessions(items);
      // Lazily resolve titles for sessions we haven't seen yet.
      setTitles((prev) => {
        const next = { ...prev };
        for (const it of items) if (!(it.id in next)) next[it.id] = "…";
        return next;
      });
      await Promise.all(
        items.map(async (it) => {
          const title = await fetchTitle(it.id, t("chat.emptyTitle"), t("chat.emptyUnreadable"));
          setTitles((prev) => ({ ...prev, [it.id]: title }));
        }),
      );
    } catch {
      /* non-fatal: the dropdown just stays empty */
    }
  }, []);

  // Load the list whenever the dropdown opens.
  useEffect(() => {
    if (listOpen) void loadSessions();
  }, [listOpen, loadSessions]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!listOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listOpen]);

  const handleNew = async () => {
    setCreating(true);
    try {
      await newSession();
      setListOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleAttach = async (file: File) => {
    try {
      const res = await api.uploadFile(file);
      const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      const note = isImage
        ? t("chat.uploadNoteImage", res.original_name, res.stored_name)
        : t("chat.uploadNoteFile", res.original_name, res.stored_name);
      await send(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chat.uploadFailed"));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="label text-[0.62rem]">{t("chat.brand")}</div>
        <div className="flex items-center gap-2" ref={listRef}>
          {/* Session switcher (admin only) */}
          {!isGuest && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="label flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6rem] transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--rule)" }}
              aria-expanded={listOpen}
              aria-haspopup="listbox"
            >
              {t("chat.sessions")}
              <IconChevron
                width={11}
                height={11}
                style={{ transform: listOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
            {listOpen && (
              <div
                role="listbox"
                aria-label={t("chat.sessionList")}
                className="absolute right-0 z-30 mt-1 max-h-[60vh] w-72 overflow-y-auto rounded-lg border shadow-lg"
                style={{
                  borderColor: "var(--rule)",
                  background: "var(--surface, #fff)",
                  color: "inherit",
                }}
              >
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[0.72rem] text-[var(--text-muted)]">
                    {t("chat.noHistory")}
                  </div>
                ) : (
                  sessions.map((s) => {
                    const active = s.id === sessionId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          if (!active) switchSession(s.id);
                          setListOpen(false);
                        }}
                        className={`flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--accent-soft)] ${
                          active ? "bg-[var(--accent-soft)]" : ""
                        }`}
                        style={{ borderColor: "var(--rule)" }}
                      >
                        <span
                          className="truncate text-[0.76rem] font-medium"
                          style={active ? { color: "var(--accent)" } : undefined}
                        >
                          {titles[s.id] ?? "…"}
                          {active && <span className="label ml-1.5 text-[0.55rem]">{t("common.current")}</span>}
                        </span>
                        <span className="label text-[0.55rem]">{fmt(s.updated_at)}</span>
                      </button>
                    );
                  })
                )}
                <div className="border-t p-2" style={{ borderColor: "var(--rule)" }}>
                  <button
                    type="button"
                    onClick={handleNew}
                    disabled={creating}
                    className="w-full rounded-md border px-3 py-1.5 text-center text-[0.72rem] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    {creating ? t("chat.creating") : t("chat.newChat")}
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-[0.66rem]"
          style={{ borderColor: "var(--rule)", background: "var(--accent-soft)" }}
          role="note"
        >
          {t("chat.guestBanner")}
        </div>
      )}

      {/* Artifact drawer ABOVE the chat: PC default-open, mobile default-closed */}
      <div className="mb-3 shrink-0">
        <button
          type="button"
          onClick={() => setArtifactsOpen((v) => !v)}
          className="label flex w-full items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--rule)", background: artifactsOpen ? "color-mix(in srgb, var(--accent-soft) 45%, transparent)" : undefined }}
          aria-expanded={artifactsOpen}
          aria-controls="artifact-drawer"
        >
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            aria-hidden
          >
            <IconResume width={12} height={12} />
          </span>
          <span>{t("chat.artifactsTitle")}</span>
          <span className="hidden truncate text-[0.56rem] font-normal opacity-70 md:inline">
            {t("chat.artifactsHint")}
          </span>
          <IconChevron
            className="ml-auto shrink-0"
            width={13}
            height={13}
            style={{ transform: artifactsOpen ? "rotate(180deg)" : "none" }}
          />
        </button>
        {artifactsOpen && (
          <div
            id="artifact-drawer"
            className="mt-2 max-h-[46vh] overflow-y-auto rounded-lg border p-3"
            style={{ borderColor: "var(--rule)", background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}
          >
            <ArtifactPanel
              refreshKey={refreshKey}
              onAsk={send}
              sessionCount={sessions.length}
              activeSessionId={sessionId}
              onSwitchSession={(id) => switchSession(id)}
              onNewSession={handleNew}
            />
          </div>
        )}
      </div>

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
              <span className="label">{t("chat.loadingHistory")}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5">
              <EmptyState
                icon={<IconChat width={40} height={40} />}
                title={t("chat.emptyWelcome")}
                hint={t("chat.emptyHint")}
              />
              <div className="flex w-full max-w-md flex-col gap-2">
                {[t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")].map((s) => (
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
              {t("chat.stop")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
