import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import ChatPanel from './components/ChatPanel';
import Layout from './components/Layout';
import ResumePanel from './components/ResumePanel';
import { useResume } from './hooks/useResume';
import { useSession } from './hooks/useSession';
import { useUiLang } from './hooks/useUiLang';
import { getUi } from './lib/i18n';
import { useSkin } from './hooks/useSkin';

/* -------------------------------------------------------------------------- */

interface BoundaryState {
  error: Error | null;
}

/** Last line of defence: a crash renders a readable card, never a white screen. */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[recruiter] render failure', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-[100dvh] w-full place-items-center bg-paper px-6">
        <div className="max-w-md border border-rule bg-surface p-7">
          <p className="sys-label mb-3 text-accent">Unhandled error</p>
          <h1 className="m-0 font-display text-2xl font-semibold text-ink">
            页面出错了 / Something broke
          </h1>
          <p className="mt-3 mb-5 text-[13.5px] leading-relaxed text-soft">
            {this.state.error.message || 'Unknown rendering error.'}
          </p>
          <button type="button" className="link-badge" onClick={() => window.location.reload()}>
            Reload ↻
          </button>
        </div>
      </div>
    );
  }
}

/* -------------------------------------------------------------------------- */

function RecruiterPortal() {
  const { sessionId, resetSession } = useSession();
  const { data, loading, error, offline, lang, setLang, languages, reload } = useResume();
  // Visitor-chosen skin — applies data-skin to <html>, persisted locally.
  useSkin();
  const { uiLang, setUiLang } = useUiLang();
  const t = getUi(uiLang);
  const isZh = uiLang.toLowerCase().startsWith('zh');

  // Keep <html lang> and the tab title in sync with the active dossier.
  useEffect(() => {
    document.documentElement.lang = isZh ? 'zh-CN' : 'en';
    const name = data?.name?.trim();
    document.title = name
      ? `${name} · ${t.masthead.dossier}`
      : isZh
        ? '候选人简历 · AI 助手'
        : 'Candidate Dossier · AI Agent';
  }, [data?.name, isZh, t.masthead.dossier]);

  return (
    <Layout
      candidateName={data?.name ?? ''}
      statusLine={data?.status}
      lang={lang}
      languages={languages}
      onLangChange={setLang}
      uiLang={uiLang}
      onUiLangChange={(l) => setUiLang(l as 'zh' | 'en')}
      t={t}
      resume={
        <ResumePanel
          data={data}
          loading={loading}
          error={error}
          offline={offline}
          lang={lang}
          t={t}
          stamp={sessionId.slice(0, 8)}
          onRetry={reload}
        />
      }
      chat={(variant, closeSheet) => (
        <ChatPanel
          sessionId={sessionId}
          lang={lang}
          t={t}
          variant={variant}
          candidateName={data?.name}
          onClose={variant === 'sheet' ? closeSheet : undefined}
          onNewThread={resetSession}
        />
      )}
    />
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <RecruiterPortal />
    </ErrorBoundary>
  );
}

export default App;
