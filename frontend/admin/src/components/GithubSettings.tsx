import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useT } from "../lib/i18n";
import { SectionHead, Card, Badge, Spinner, ErrorNote } from "./ui";
import { IconCheck, IconSpinner, IconTrash } from "./icons";

interface GithubStatus {
  pat: boolean;
  oauth: { bound: boolean; login: string | null };
  source: "pat" | "oauth" | null;
  user: string | null;
}

interface RepoInfo {
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  language: string | null;
  pushed_at: string | null;
}

/** Read the OAuth callback result GitHub left in the URL fragment. */
function readFragmentResult(): { bound?: string; error?: string } {
  const h = window.location.hash;
  if (!h.includes("bound=") && !h.includes("error=")) return {};
  const params = new URLSearchParams(h.slice(1));
  const out = { bound: params.get("bound") ?? undefined, error: params.get("error") ?? undefined };
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return out;
}

export default function GithubSettings() {
  const t = useT();
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pat, setPat] = useState("");
  const [saving, setSaving] = useState(false);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const oauthWindow = useRef<Window | null>(null);

  const load = async () => {
    try {
      setStatus(await api.getGithubStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const frag = readFragmentResult();
    if (frag.bound) {
      setNotice(t("github.boundOk", frag.bound));
      void load();
    } else if (frag.error) {
      setError(t("github.boundFail", frag.error));
    }
  }, []);

  const savePat = async () => {
    const trimmed = pat.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.saveGithubPat(trimmed);
      setNotice(t("github.patSaved", r.login));
      setPat("");
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const removeCreds = async () => {
    try {
      await api.removeGithubCreds();
      setNotice(t("github.credsCleared"));
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.deleteFailed"));
    }
  };

  const unbindOauth = async () => {
    try {
      await api.unbindGithubOauth();
      setNotice(t("github.oauthUnbound"));
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.unbindFailed"));
    }
  };

  const startOauth = async () => {
    try {
      const { url } = await api.githubOauthStart();
      oauthWindow.current = window.open(url, "github-oauth", "width=680,height=760");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.oauthStartFailed"));
    }
  };

  const loadRepos = async () => {
    setReposLoading(true);
    setError(null);
    try {
      const r = await api.listGithubRepos();
      setRepos(r.repos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("github.reposFailed"));
    } finally {
      setReposLoading(false);
    }
  };

  if (loading) return <Spinner label={t("github.loading")} />;

  return (
    <div className="space-y-5">
      <SectionHead title={t("github.title")} en={t.lang === "zh" ? t("github.subtitle") : undefined} />

      {notice && (
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-moss-500)", color: "var(--color-moss-500)", background: "var(--surface)" }}
        >
          <IconCheck width={15} height={15} /> {notice}
        </div>
      )}
      {error && <ErrorNote message={error} />}

      {/* Current status */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="label text-[0.6rem]">{t("github.currentStatus")}</span>
        <Badge tone={status?.pat ? "moss" : "neutral"}>PAT {status?.pat ? t("github.patHosted") : t("github.patMissing")}</Badge>
        <Badge tone={status?.oauth.bound ? "moss" : "neutral"}>
          OAuth {status?.oauth.bound ? t("github.oauthBound", status.oauth.login ?? "") : t("github.oauthMissing")}
        </Badge>
        {status?.user && <span className="label text-[0.58rem]">{t("github.activeAccount", status.user)}（{status.source}）</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={loadRepos} disabled={reposLoading} className="btn text-xs">
            {reposLoading ? <IconSpinner width={14} height={14} /> : t("github.fetchRepos")}
          </button>
          {(status?.pat || status?.oauth.bound) && (
            <button
              type="button"
              onClick={removeCreds}
              className="focus-ring grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--color-ember-500)]"
              aria-label={t("github.clearAll")}
              title={t("github.clearAll")}
            >
              <IconTrash width={15} height={15} />
            </button>
          )}
        </div>
      </Card>

      {/* Repo list */}
      {repos && (
        <Card className="max-h-72 divide-y overflow-y-auto" style={{ borderColor: "var(--rule)" }}>
          {repos.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("github.noRepos")}</div>
          ) : (
            repos.map((r) => (
              <div key={r.full_name} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{r.full_name}</div>
                  {r.description && <div className="label mt-0.5 truncate text-[0.54rem]">{r.description}</div>}
                </div>
                {r.private && <Badge tone="warn">{t("common.private")}</Badge>}
                {r.language && <Badge tone="neutral">{r.language}</Badge>}
                <a
                  href={r.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="label text-[0.56rem] hover:text-[var(--accent)]"
                >
                  ↗
                </a>
              </div>
            ))
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* PAT hosting */}
        <Card className="p-4">
          <div className="label mb-2 text-[0.6rem]">{t("github.patTitle")}</div>
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
            {t("github.patHelp")}
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              className="input flex-1 font-mono text-xs"
              placeholder="github_pat_… / ghp_…"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePat()}
            />
            <button type="button" onClick={savePat} disabled={saving || pat.trim().length < 20} className="btn shrink-0 text-xs">
              {saving ? <IconSpinner width={14} height={14} /> : t("github.patSave")}
            </button>
          </div>
        </Card>

        {/* OAuth binding */}
        <Card className="p-4">
          <div className="label mb-2 text-[0.6rem]">{t("github.oauthTitle")}</div>
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
            {t("github.oauthHelp")}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startOauth} className="btn text-xs">
              {t("github.oauthBind")}
            </button>
            {status?.oauth.bound && (
              <button type="button" onClick={unbindOauth} className="label text-[0.6rem] hover:text-[var(--color-ember-500)]">
                {t("github.unbind")}
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
