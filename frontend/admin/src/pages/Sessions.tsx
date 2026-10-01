import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Session, Message } from "../types/api";
import { useT } from "../lib/i18n";
import { SectionHead, Card, Badge, Spinner, ErrorNote, EmptyState } from "../components/ui";
import { IconSessions, IconSearch, IconChevron } from "../components/icons";

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function fmt(iso: string, lang: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Read-only transcript renderer for a recruiter session. */
function Transcript({ messages, loading }: { messages: Message[]; loading: boolean }) {
  const t = useT();
  if (loading) return <Spinner label={t("sessions.loadingTranscript")} />;
  if (messages.length === 0)
    return <div className="py-10 text-center text-sm text-[var(--text-muted)]">{t("sessions.noMessages")}</div>;

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
              {isUser ? t("sessions.you") : "AI"}
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
              <div className="label mt-1 px-1 text-[0.52rem]">{fmt(m.created_at, t.lang)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Recruiter sessions admin page.
 *
 * PC: two-pane master-detail (session list on the left, transcript on the
 * right). Mobile: one pane at a time — the list first, then a full-width
 * transcript with a back button, so the selected conversation starts at the
 * top of the viewport instead of below a long list.
 *
 * Sessions without any message (recruiter opened the portal but never sent
 * anything) are hidden behind a toggle instead of polluting the list.
 */
export default function Sessions() {
  const t = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listSessions("recruiter");
      setSessions(r.sessions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("sessions.loadFailed"));
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
      setError(err instanceof ApiError ? err.message : t("sessions.loadMsgsFailed"));
    } finally {
      setLoadingMsgs(false);
    }
  };

  // Auto-scroll the transcript to the newest message whenever it changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingMsgs, selected]);

  // Empty sessions carry no conversation — hide them by default.
  const withContent = sessions.filter((s) => (s.message_count ?? 0) > 0);
  const visible = showEmpty ? sessions : withContent;
  const emptyCount = sessions.length - withContent.length;

  const filtered = visible.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.created_at.toLowerCase().includes(q) ||
      s.updated_at.toLowerCase().includes(q)
    );
  });

  const listBody = (
    <>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <IconSearch width={16} height={16} />
        </span>
        <input
          className="input pl-9"
          placeholder={t("sessions.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <ErrorNote message={error} />}

      {loading ? (
        <Spinner label={t("sessions.loading")} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<IconSessions width={40} height={40} />} title={t("sessions.empty")} hint={t("sessions.emptyHint")} />
      ) : (
        <Card className="divide-y overflow-hidden" style={{ borderColor: "var(--rule)" }}>
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
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={active ? "accent" : "neutral"}>
                      {(s.message_count ?? 0) > 99 ? "99+" : (s.message_count ?? 0)} msg
                    </Badge>
                    <IconChevron className="lg:hidden" width={13} height={13} style={{ transform: "rotate(-90deg)" }} />
                  </span>
                </div>
                <div className="label text-[0.55rem]">{t("sessions.created")} {fmt(s.created_at, t.lang)}</div>
                <div className="label text-[0.55rem]">{t("sessions.active")} {fmt(s.updated_at, t.lang)}</div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">{t("sessions.noMatch")}</div>
          )}
        </Card>
      )}

      {emptyCount > 0 && (
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="label self-start text-[0.6rem] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--accent)]"
        >
          {showEmpty ? t("sessions.hideEmpty") : t("sessions.showEmpty", emptyCount)}
        </button>
      )}
    </>
  );

  const transcriptBody = (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0" style={{ borderColor: "var(--rule)" }}>
      {selected ? (
        <>
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {/* Mobile only: back to the session list */}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="label flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6rem] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] lg:hidden"
                style={{ borderColor: "var(--rule)" }}
              >
                <IconChevron width={11} height={11} style={{ transform: "rotate(90deg)" }} />
                {t("common.backToList")}
              </button>
              <span className="truncate font-mono text-xs text-[var(--text-muted)]">{selected}</span>
            </div>
            <Badge tone="neutral">{t("sessions.readonly")}</Badge>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <Transcript messages={messages} loading={loadingMsgs} />
          </div>
        </>
      ) : (
        <div className="hidden lg:flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <IconSessions width={34} height={34} />
          <span className="text-sm">{t("sessions.pickOne")}</span>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-5">
      <SectionHead title={t("sessions.title")} en={t.lang === "zh" ? t("sessions.titleEn", withContent.length) : undefined} />

      {/* Mobile: show either the list or the transcript, never both stacked.
          PC: master-detail grid as before. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start lg:gap-5 lg:space-y-0">
        {/* List pane — hidden on mobile while a session is open */}
        <div className={`flex flex-col gap-3 space-y-3 lg:space-y-3 ${selected ? "hidden lg:flex" : "flex"}`}>
          {listBody}
        </div>

        {/* Transcript pane — on mobile only rendered once a session is picked */}
        <div className={`mt-0 ${selected ? "block" : "hidden lg:block"}`}>
          {selected ? (
            transcriptBody
          ) : (
            <div className="hidden lg:block">
              {transcriptBody}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
