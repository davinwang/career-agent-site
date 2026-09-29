import { useEffect, useState } from "react";

/**
 * OAuth callback landing page. GitHub redirects here with ?code=…; the backend
 * exchanges the code and bounces back with #bound=<login> or #error=<msg>.
 * This page reads the fragment, shows the result, and sends the user onward.
 */
export default function GithubCallback() {
  const [state, setState] = useState<{ bound?: string; error?: string }>({});
  const [count, setCount] = useState(3);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const bound = params.get("bound") ?? undefined;
    const error = params.get("error") ?? undefined;
    setState({ bound, error });
    if (bound || error) {
      // Let the dashboard (same SPA) pick the fragment up after navigation.
      const timer = setInterval(() => {
        setCount((c) => {
          if (c <= 1) {
            clearInterval(timer);
            window.location.replace("/admin/");
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {state.bound ? (
        <>
          <div className="font-display text-2xl font-semibold" style={{ color: "var(--color-moss-500)" }}>
            ✓ GitHub @{state.bound} 绑定成功
          </div>
          <p className="text-sm text-[var(--text-muted)]">{count} 秒后返回管理端…</p>
        </>
      ) : state.error ? (
        <>
          <div className="font-display text-xl font-semibold" style={{ color: "var(--color-ember-500)" }}>
            绑定失败：{decodeURIComponent(state.error)}
          </div>
          <p className="text-sm text-[var(--text-muted)]">{count} 秒后返回管理端…</p>
        </>
      ) : (
        <div className="text-sm text-[var(--text-muted)]">处理 GitHub 授权回调…</div>
      )}
    </div>
  );
}
