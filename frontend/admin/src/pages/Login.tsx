import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { IconSpinner } from "../components/icons";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/chat";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setLoading(true);
    const ok = await login(username.trim(), password);
    setLoading(false);
    if (ok) {
      navigate(from, { replace: true });
    } else {
      setError("用户名或密码错误，或后端服务不可用");
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "var(--bg)" }}
    >
      {/* Ambient ember glow */}
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 70%)" }}
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="rise relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl font-display text-2xl font-bold shadow-lg"
            style={{ background: "var(--accent)", color: "var(--color-paper-50)" }}
          >
            JA
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">简历 Agent</h1>
          <p className="label mt-2 text-[0.66rem]">Admin Console · 管理端登录</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="card space-y-4 p-6 shadow-xl"
          style={{ boxShadow: "0 20px 50px -20px rgba(0,0,0,0.35)" }}
        >
          <div>
            <label htmlFor="u" className="label mb-1.5 block text-[0.62rem]">
              用户名 / Username
            </label>
            <input
              id="u"
              className="input"
              value={username}
              autoComplete="username"
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>

          <div>
            <label htmlFor="p" className="label mb-1.5 block text-[0.62rem]">
              密码 / Password
            </label>
            <input
              id="p"
              type="password"
              className="input"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: "var(--color-ember-500)", background: "var(--accent-soft)" }}
              role="alert"
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
            {loading ? (
              <>
                <IconSpinner width={16} height={16} /> 登录中…
              </>
            ) : (
              "登 录"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          仅限候选人本人访问 · 受 JWT 保护
        </p>
      </div>
    </div>
  );
}
