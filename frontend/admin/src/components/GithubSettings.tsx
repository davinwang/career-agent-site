import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
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
      setError(err instanceof ApiError ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const frag = readFragmentResult();
    if (frag.bound) {
      setNotice(`GitHub 账号 @${frag.bound} 绑定成功`);
      void load();
    } else if (frag.error) {
      setError(`GitHub 绑定失败：${frag.error}`);
    }
  }, []);

  const savePat = async () => {
    const trimmed = pat.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.saveGithubPat(trimmed);
      setNotice(`PAT 已验证并托管（账号 @${r.login}）`);
      setPat("");
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeCreds = async () => {
    try {
      await api.removeGithubCreds();
      setNotice("已清除托管的 GitHub 凭证");
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  const unbindOauth = async () => {
    try {
      await api.unbindGithubOauth();
      setNotice("已解绑 GitHub 账号");
      setRepos(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "解绑失败");
    }
  };

  const startOauth = async () => {
    try {
      const { url } = await api.githubOauthStart();
      oauthWindow.current = window.open(url, "github-oauth", "width=680,height=760");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "无法发起 GitHub 授权");
    }
  };

  const loadRepos = async () => {
    setReposLoading(true);
    setError(null);
    try {
      const r = await api.listGithubRepos();
      setRepos(r.repos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取仓库失败");
    } finally {
      setReposLoading(false);
    }
  };

  if (loading) return <Spinner label="加载 GitHub 状态…" />;

  return (
    <div className="space-y-5">
      <SectionHead title="GitHub 凭证" en="Credential hosting & account binding" />

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
        <span className="label text-[0.6rem]">当前状态</span>
        <Badge tone={status?.pat ? "moss" : "neutral"}>PAT {status?.pat ? "已托管" : "未托管"}</Badge>
        <Badge tone={status?.oauth.bound ? "moss" : "neutral"}>
          OAuth {status?.oauth.bound ? `已绑定 @${status.oauth.login}` : "未绑定"}
        </Badge>
        {status?.user && <span className="label text-[0.58rem]">生效账号 @{status.user}（{status.source}）</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={loadRepos} disabled={reposLoading} className="btn text-xs">
            {reposLoading ? <IconSpinner width={14} height={14} /> : "拉取仓库列表"}
          </button>
          {(status?.pat || status?.oauth.bound) && (
            <button
              type="button"
              onClick={removeCreds}
              className="focus-ring grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--color-ember-500)]"
              aria-label="清除全部凭证"
              title="清除全部凭证"
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
            <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">该凭证可见 0 个仓库</div>
          ) : (
            repos.map((r) => (
              <div key={r.full_name} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{r.full_name}</div>
                  {r.description && <div className="label mt-0.5 truncate text-[0.54rem]">{r.description}</div>}
                </div>
                {r.private && <Badge tone="warn">私有</Badge>}
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
          <div className="label mb-2 text-[0.6rem]">方式一 · 托管 PAT</div>
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
            在 GitHub → Settings → Developer settings → Fine-grained tokens
            创建仅含 <span className="font-mono">repo</span> 权限的 token，粘贴到此处。
            凭证以 AES-256-GCM 加密存储，仅用于拉取你的项目仓库。
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
              {saving ? <IconSpinner width={14} height={14} /> : "验证并托管"}
            </button>
          </div>
        </Card>

        {/* OAuth binding */}
        <Card className="p-4">
          <div className="label mb-2 text-[0.6rem]">方式二 · 绑定 GitHub 账号</div>
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
            通过 GitHub OAuth 授权（官方授权码流程）。需要服务端配置
            <span className="font-mono"> GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET</span>。
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startOauth} className="btn text-xs">
              使用 GitHub 登录绑定
            </button>
            {status?.oauth.bound && (
              <button type="button" onClick={unbindOauth} className="label text-[0.6rem] hover:text-[var(--color-ember-500)]">
                解绑
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
