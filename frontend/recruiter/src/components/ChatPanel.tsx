import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useChat } from '../hooks/useChat';
import { getSuggestedPrompts, type UiStrings } from '../lib/i18n';
import { renderMarkdown } from '../lib/markdown';
import { clockTime, cx } from '../lib/utils';
import type { ChatMessage } from '../types/resume';
import { ASK_EVENT } from './resume/Projects';
import {
  AlertIcon,
  ArrowRight,
  ChatIcon,
  ChevronDown,
  CloseIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
} from './Icons';

interface Props {
  sessionId: string;
  lang: string;
  t: UiStrings;
  /** `dock` = always-visible desktop pane, `sheet` = mobile bottom sheet */
  variant?: 'dock' | 'sheet';
  candidateName?: string;
  onClose?: () => void;
  onNewThread: () => void;
}

/* -------------------------------------------------------------------------- */
/* pieces                                                                      */
/* -------------------------------------------------------------------------- */

function StatusPill({ status, t }: { status: string; t: UiStrings }) {
  const map: Record<string, { label: string; className: string; pulse: boolean }> = {
    streaming: { label: t.chat.streaming, className: 'text-accent', pulse: true },
    connecting: { label: t.chat.connecting, className: 'text-gold', pulse: true },
    error: { label: t.chat.offline, className: 'text-accent', pulse: false },
    idle: { label: t.chat.online, className: 'text-teal', pulse: false },
  };
  const s = map[status] ?? map.idle!;
  return (
    <span className={cx('flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase', s.className)}>
      <span className={cx('h-[5px] w-[5px] rounded-full bg-current', s.pulse && 'animate-pulse')} aria-hidden />
      {s.label}
    </span>
  );
}

function AgentAvatar() {
  return (
    <span
      aria-hidden
      className="mt-[3px] grid h-6 w-6 shrink-0 place-items-center border border-accent/40 bg-accentsoft text-accent"
    >
      <SparkIcon className="h-3.5 w-3.5" />
    </span>
  );
}

function Bubble({ msg, t }: { msg: ChatMessage; t: UiStrings }) {
  const isUser = msg.role === 'user';
  const html = useMemo(
    () => (isUser ? '' : renderMarkdown(msg.content)),
    [isUser, msg.content],
  );
  const empty = !msg.content && msg.streaming;

  return (
    <div className={cx('flex w-full gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? <AgentAvatar /> : null}

      <div className={cx('flex min-w-0 max-w-[86%] flex-col', isUser && 'items-end')}>
        <span className="sys-label mb-1 tracking-[0.16em]">
          {isUser ? t.chat.you : t.chat.agent}
          {msg.createdAt ? <span className="ml-2 tabular-nums opacity-60">{clockTime(msg.createdAt)}</span> : null}
        </span>

        {msg.error ? (
          <div className="bubble bubble--error flex items-start gap-2">
            <AlertIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-all">{msg.content}</span>
          </div>
        ) : isUser ? (
          <div className="bubble bubble--user whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <div className="bubble bubble--bot">
            {empty ? (
              <span className="flex items-center gap-1.5 py-1" aria-label={t.chat.thinking}>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            ) : (
              <>
                <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
                {msg.streaming ? <span className="stream-caret" aria-hidden /> : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* panel                                                                       */
/* -------------------------------------------------------------------------- */

export function ChatPanel({
  sessionId,
  lang,
  t,
  variant = 'dock',
  candidateName,
  onClose,
  onNewThread,
}: Props) {
  const { messages, status, historyError, sendError, send, stop, clear } = useChat(sessionId);
  const isZh = lang.toLowerCase().startsWith('zh');

  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const busy = status === 'streaming';
  const prompts = useMemo(() => getSuggestedPrompts(lang), [lang]);
  const showWelcome = messages.length === 0;

  /* ------------------------------------------------------- auto scroll -- */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pinned, busy]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance < 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(true);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  /* --------------------------------------------------- textarea sizing -- */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 152)}px`;
  }, [draft]);

  // Focus the composer when the mobile sheet opens. The panel stays mounted
  // while the sheet is closed (it is parked off-screen and `inert`), so guard
  // against stealing focus — and popping the on-screen keyboard — on load.
  useEffect(() => {
    if (variant !== 'sheet' || busy) return undefined;
    const id = window.setTimeout(() => {
      const ta = taRef.current;
      if (!ta || ta.closest('[inert]')) return;
      ta.focus({ preventScroll: true });
    }, 380);
    return () => window.clearTimeout(id);
  }, [variant, busy]);

  /* ------------------------------------------------------------ submit -- */
  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setPinned(true);
    send(text);
  }, [busy, draft, send]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    // Never steal Enter from a CJK IME that is still composing candidates.
    if (e.shiftKey || composing.current || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  // Project question cards (resume pane) dispatch ask events. `direct` = the
  // question is answerable from the dossier alone → send it right away;
  // otherwise only fill the composer so the recruiter can attach material.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string; direct?: boolean }>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      setPinned(true);
      if (detail?.direct && status !== 'streaming') {
        send(text);
      } else {
        setDraft(text);
      }
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [send, status]);

  const handleNewThread = () => {
    if (messages.length && !window.confirm(t.chat.clearConfirm)) return;
    clear();
    onNewThread();
  };

  const sheet = variant === 'sheet';

  return (
    <section
      className="relative flex h-full min-h-0 flex-col bg-surface"
      aria-label={t.a11y.chatPanel}
    >
      {/* subtle console texture along the top edge */}
      <div
        aria-hidden
        className="console-fade pointer-events-none absolute inset-x-0 top-0 h-24"
      />

      {/* ── header ───────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-rule px-4 py-3 sm:px-5">
        {sheet ? (
          <span className="sheet-grabber absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[5px]" aria-hidden />
        ) : null}

        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center border border-rule bg-raised text-accent"
        >
          <ChatIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate font-display text-[15px] font-semibold tracking-[0.02em] text-ink">
            {t.chat.title}
          </h2>
          <div className="mt-[3px] flex items-center gap-2.5">
            <StatusPill status={status} t={t} />
            <span className="hidden truncate font-mono text-[9.5px] tracking-[0.1em] text-mute sm:inline">
              {candidateName ? `${t.masthead.candidate}: ${candidateName}` : t.chat.subtitle}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="icon-btn"
            onClick={handleNewThread}
            title={t.chat.clear}
            aria-label={t.chat.clear}
          >
            <SparkIcon className="h-4 w-4" />
          </button>
          {sheet && onClose ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t.chat.close}>
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      {/* ── transcript ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-slim relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {historyError ? (
          <p className="mb-4 flex items-center gap-2 border border-dashed border-rule px-3 py-2 font-mono text-[10.5px] text-mute">
            <AlertIcon className="h-3.5 w-3.5 shrink-0" />
            {t.chat.historyFailed}
          </p>
        ) : null}

        {showWelcome ? (
          <div className="animate-[pop-in_0.5s_cubic-bezier(0.16,1,0.3,1)_both] flex h-full flex-col justify-center py-4">
            <p className="sys-label mb-3 flex items-center gap-2">
              <span className="live-dot" aria-hidden />
              {t.chat.suggested}
            </p>
            <h3 className="m-0 max-w-[24ch] font-display text-[clamp(1.4rem,3.4vw,1.95rem)] leading-[1.2] font-semibold text-ink">
              {t.chat.welcomeTitle}
            </h3>
            <p className="mt-3 mb-6 max-w-[52ch] text-[13.5px] leading-[1.85] text-soft">
              {t.chat.welcomeBody}
            </p>

            <div className="flex flex-col gap-2">
              {prompts.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className="prompt-card group animate-[pop-in_0.45s_cubic-bezier(0.16,1,0.3,1)_both]"
                  style={{ animationDelay: `${180 + i * 70}ms` }}
                  onClick={() => {
                    // Fill the composer instead of sending: suggested prompts
                    // may need attachments (e.g. uploading the old resume),
                    // so let the visitor review and edit before sending.
                    setDraft(p);
                    setPinned(true);
                  }}
                >
                  <span className="sys-num shrink-0 pt-[3px]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0">{p}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 self-center opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-5">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} t={t} />
            ))}
            {sendError && !messages.some((m) => m.error) ? (
              <div className="bubble bubble--error mx-auto flex items-start gap-2">
                <AlertIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                <span>
                  {t.chat.errorBody}
                  <span className="ml-2 opacity-70">{sendError}</span>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* jump-to-latest */}
      {!pinned && !showWelcome ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="animate-[pop-in_0.25s_ease-out_both] absolute right-5 bottom-[104px] z-20 grid h-8 w-8 place-items-center rounded-full border border-rule bg-surface text-soft shadow-lg transition-colors hover:border-accent hover:text-accent"
          aria-label={isZh ? '回到最新消息' : 'Jump to latest'}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}

      {/* ── composer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 shrink-0 border-t border-rule px-4 pt-3 pb-3 sm:px-5 sm:pb-4">
        <div className="mx-auto w-full max-w-[46rem]">
          <div className="composer">
            <textarea
              ref={taRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              placeholder={busy ? t.chat.placeholderBlocked : t.chat.placeholder}
              aria-label={t.a11y.sendMessage}
              className="scroll-slim"
            />
            {busy ? (
              <button
                type="button"
                className="send-btn"
                onClick={stop}
                aria-label={t.chat.stop}
                title={t.chat.stop}
              >
                <StopIcon className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={submit}
                disabled={!draft.trim()}
                aria-label={t.a11y.sendMessage}
                title={t.chat.send}
              >
                <SendIcon className="h-[17px] w-[17px]" />
              </button>
            )}
          </div>

          <p className="sys-label mt-2 mb-0 flex flex-wrap items-center gap-x-2 tracking-[0.1em] normal-case opacity-70">
            <span className="truncate">{t.chat.footer}</span>
            <span className="ml-auto hidden shrink-0 tabular-nums sm:inline" title={sessionId}>
              {t.chat.session} #{sessionId.slice(0, 8)}
            </span>
          </p>
        </div>
      </footer>
    </section>
  );
}

export default ChatPanel;
