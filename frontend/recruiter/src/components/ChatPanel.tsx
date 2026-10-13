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
import { fetchRecruiterSkills, type RecruiterSkill } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import { fetchAttachments, uploadAttachment, type VisitorAttachment } from '../lib/api';
import { clockTime, cx } from '../lib/utils';
import type { ChatMessage, ResumeData } from '../types/resume';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { ASK_EVENT } from './resume/Projects';
import ProjectPrompts from './ProjectPrompts';
import SkillStrip from './SkillStrip';
import {
  AlertIcon,
  ArrowRight,
  ChatIcon,
  ChevronDown,
  CloseIcon,
  DocIcon,
  SendIcon,
  AgentMarkIcon,
  PaperclipIcon,
  SparkIcon,
  StopIcon,
  UserIcon,
} from './Icons';

interface Props {
  sessionId: string;
  lang: string;
  t: UiStrings;
  /** `dock` = always-visible desktop pane, `sheet` = mobile bottom sheet */
  variant?: 'dock' | 'sheet';
  candidateName?: string;
  /** Published résumé for the current language — feeds the @ reference picker. */
  resumeData?: ResumeData | null;
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
      className="mt-[3px] grid h-7 w-7 shrink-0 place-items-center border border-hair bg-surface text-soft"
    >
      <AgentMarkIcon className="h-4 w-4" />
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
      {isUser ? (
        <span
          aria-hidden
          className="mt-[3px] grid h-7 w-7 shrink-0 place-items-center border border-accent/40 bg-accentsoft text-accent"
        >
          <UserIcon className="h-4 w-4" />
        </span>
      ) : (
        <AgentAvatar />
      )}

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
  resumeData,
  onClose,
  onNewThread,
}: Props) {
  const { messages, status, historyError, sendError, send, stop, clear } = useChat(sessionId);
  const isZh = lang.toLowerCase().startsWith('zh');

  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState(true);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploads, setUploads] = useState<VisitorAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState<RecruiterSkill[]>([]);

  // Current-language skills for the "view prompts" popover (names only).
  useEffect(() => {
    let active = true;
    fetchRecruiterSkills(lang).then((s) => {
      if (active) setSkills(s);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  // Public feature flags: show the "visit admin console" invitation only
  // when the backend has ALLOW_GUEST_MODE=true.
  useEffect(() => {
    let active = true;
    fetch('/api/public/config')
      .then((r) => (r.ok ? r.json() : { guestMode: false }))
      .then((c: { guestMode?: boolean }) => {
        if (active) setGuestMode(Boolean(c.guestMode));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const busy = status === 'streaming';
  useKeyboardInset();
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

  // ── attachments (JD etc.) ────────────────────────────────────────────────
  // Refresh the picker list whenever it opens; uploads are per-session.
  useEffect(() => {
    if (!pickerOpen) return;
    fetchAttachments(sessionId).then(setUploads).catch(() => setUploads([]));
  }, [pickerOpen, sessionId]);

  const handleAttach = async (files: File[]) => {
    if (files.length === 0) return;
    setAttaching(true);
    setAttachNote(null);
    try {
      for (const f of files) {
        const r = await uploadAttachment(sessionId, f);
        setAttachNote(r.ok ? `${f.name} · ${t.chat.attachDone}` : `${t.chat.attachFail}: ${r.error}`);
        if (r.ok) setUploads((u) => [...u, r.attachment]);
      }
    } finally {
      setAttaching(false);
    }
  };

  // Unified reference snippets. Both ends insert the same `[@标签：名称]` form;
  // the agent resolves them via getFullResume / searchKnowledge / attachments.
  const insertRef = (snippet: string) => {
    setDraft((d) => (d.includes(snippet) ? d : d ? `${d} ${snippet}` : `${snippet} `));
    setPickerOpen(false);
    taRef.current?.focus();
  };

  const reference = (u: VisitorAttachment) => {
    insertRef(t.chat.refSnippet.replace('{name}', u.original_name));
  };

  // Resume reference entries: one per section item, plus summary/skills.
  const resumeRefs = useMemo(() => {
    if (!resumeData) return [] as { label: string; snippet: string }[];
    const zh = isZh;
    const refs: { label: string; snippet: string }[] = [];
    if (resumeData.summary) refs.push({ label: t.chat.refSummary, snippet: `[@${t.chat.refSummary}]` });
    resumeData.experience.forEach((e) =>
      refs.push({ label: `${e.company} · ${e.role}`, snippet: `[@${t.chat.refExperience}：${e.company} ${e.role}]` }),
    );
    resumeData.projects.forEach((p) =>
      refs.push({ label: p.name, snippet: `[@${t.chat.refProject}：${p.name}]` }),
    );
    resumeData.education.forEach((e) =>
      refs.push({ label: `${e.school} ${e.degree}`, snippet: `[@${t.chat.refEducation}：${e.school}]` }),
    );
    if (Object.keys(resumeData.skills).length > 0)
      refs.push({ label: t.chat.refSkills, snippet: `[@${t.chat.refSkills}]` });
    void zh;
    return refs;
  }, [resumeData, isZh, t]);

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
            {guestMode ? (
              <a
                className="hidden font-mono text-[9.5px] tracking-[0.1em] text-accent underline decoration-dotted underline-offset-2 hover:text-ink sm:inline"
                href="/admin/"
                target="_blank"
                rel="noreferrer"
              >
                {t.chat.visitAdmin} →
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="icon-btn relative"
            onClick={() => setPromptsOpen((v) => !v)}
            title={t.chat.viewPrompts}
            aria-label={t.chat.viewPrompts}
            aria-expanded={promptsOpen}
          >
            <DocIcon className="h-4 w-4" />
          </button>
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

      {/* ── "view prompts" popover (PC) / full sheet (mobile) ─────────────── */}
      {promptsOpen ? (
        <>
          {/* click-away backdrop (mobile full-screen dim, PC transparent) */}
          <div
            className="fixed inset-0 z-30 bg-black/25 sm:bg-transparent"
            onClick={() => setPromptsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label={t.chat.viewPrompts}
            className="fixed inset-x-3 top-14 z-40 animate-[pop-in_0.2s_ease-out_both] border border-rule bg-surface p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-3 sm:top-12 sm:w-80 sm:p-3.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-accent">
                {t.chat.viewPrompts}
              </span>
              <button
                type="button"
                className="text-mute transition-colors hover:text-accent"
                onClick={() => setPromptsOpen(false)}
                aria-label={t.chat.close}
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {skills.length === 0 ? (
              <p className="py-2 text-[12px] text-mute">{t.chat.promptsEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {skills.map((s) => (
                  <li key={s.id} className="border border-rule bg-raised/60 px-2.5 py-2">
                    <p className="m-0 font-mono text-[11px] tracking-[0.06em] text-ink">{s.name}</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-soft">{s.prompt}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2.5 border-t border-dashed border-rule pt-2 text-[10.5px] leading-relaxed text-mute">
              {t.chat.promptsNote}
            </p>
          </div>
        </>
      ) : null}

      {/* ── transcript ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-slim relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper px-4 py-5 sm:px-5"
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

      {/* ── per-project question prompts (project card focus) ────────────── */}
      <ProjectPrompts lang={lang} t={t} />
      <SkillStrip lang={lang} t={t} />

      {/* ── composer ─────────────────────────────────────────────────────── */}
      <footer
        className="relative z-10 shrink-0 border-t border-rule px-4 pt-3 sm:px-5"
        /* `--kb` = on-screen keyboard height (0 on desktop). Lifts the composer
           above the mobile keyboard, which otherwise covers it. */
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px) + var(--kb, 0px))",
        }}
      >
        <div className="mx-auto w-full max-w-[46rem]">
          {/* unified reference picker: résumé sections + attachments */}
          {pickerOpen && (
            <div
              className="absolute bottom-full left-4 z-30 mb-2 w-72 border border-rule bg-surface p-2 shadow-xl sm:left-5"
              role="listbox"
              aria-label={t.chat.refTitle}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="sys-label m-0">{t.chat.refTitle}</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="text-mute transition-colors hover:text-accent"
                  aria-label={t.chat.close}
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {resumeRefs.length > 0 && (
                <>
                  <div className="sys-label mb-1 mt-1">{t.chat.refGroupResume}</div>
                  <div className="scroll-slim max-h-44 space-y-0.5 overflow-y-auto">
                    {resumeRefs.map((r) => (
                      <button
                        key={r.snippet}
                        type="button"
                        onClick={() => insertRef(r.snippet)}
                        className="block w-full truncate px-2 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-paper"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="sys-label mb-1 mt-2">{t.chat.refGroupAttach}</div>
              {uploads.length === 0 ? (
                <div className="py-2 text-center text-[11px] text-mute">{t.chat.noAttachments}</div>
              ) : (
                <div className="scroll-slim max-h-44 space-y-0.5 overflow-y-auto">
                  {uploads.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => reference(u)}
                      className="block w-full px-2 py-1.5 text-left transition-colors hover:bg-paper"
                    >
                      <div className="truncate text-[12px] font-medium text-ink">{u.original_name}</div>
                      <div className="sys-label m-0">{(u.size / 1024).toFixed(0)} KB</div>
                    </button>
                  ))}
                </div>
              )}

              {resumeRefs.length === 0 && uploads.length === 0 && (
                <div className="py-3 text-center text-[11px] text-mute">{t.chat.refEmpty}</div>
              )}
            </div>
          )}

          {attachNote && (
            <p className="sys-label mb-1.5 flex items-center gap-1.5 normal-case tracking-[0.06em] text-accent">
              <PaperclipIcon className="h-3 w-3" />
              <span className="min-w-0 truncate">{attachNote}</span>
            </p>
          )}

          <div className="composer">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                await handleAttach(files);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attaching}
              aria-label={t.chat.attach}
              title={t.chat.attach}
              className="icon-btn shrink-0 disabled:opacity-50"
            >
              <PaperclipIcon className={cx('h-4 w-4', attaching && 'animate-pulse')} />
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-label={t.chat.reference}
              title={t.chat.reference}
              className="icon-btn shrink-0"
              style={{ color: pickerOpen ? 'var(--c-accent)' : undefined }}
            >
              <span className="font-mono text-[10px] font-semibold tracking-[0.08em]">@</span>
            </button>
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
