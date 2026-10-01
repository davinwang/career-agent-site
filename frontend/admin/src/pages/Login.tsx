import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import { IconSpinner } from "../components/icons";
import ThemeToggle from "../components/ThemeToggle";
import LangSwitch from "../components/LangSwitch";

export default function Login() {
  const login = useAuth((s) => s.login);
  const guestLogin = useAuth((s) => s.guestLogin);
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestEnabled, setGuestEnabled] = useState(false);

  // Probe whether the backend allows guest access — the button only renders
  // when guest mode is on server-side.
  useEffect(() => {
    let active = true;
    api
      .guestStatus()
      .then((r) => {
        if (active) setGuestEnabled(!!r.enabled);
      })
      .catch(() => {
        /* probe failed — keep the button hidden */
      });
    return () => {
      active = false;
    };
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? "/chat";

  const onGuest = async () => {
    if (guestLoading) return;
    setError(null);
    setGuestLoading(true);
    const ok = await guestLogin();
    setGuestLoading(false);
    if (ok) {
      navigate(from, { replace: true });
    } else {
      setError(t("login.errGuest"));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!username.trim() || !password) {
      setError(t("login.errRequired"));
      return;
    }
    setLoading(true);
    const ok = await login(username.trim(), password);
    setLoading(false);
    if (ok) {
      navigate(from, { replace: true });
    } else {
      setError(t("login.errInvalid"));
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
        <span className="mr-2 inline-block align-middle">
          <LangSwitch />
        </span>
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
          <h1 className="font-display text-3xl font-bold tracking-tight">{t("login.title")}</h1>
          <p className="label mt-2 text-[0.66rem]">{t("login.subtitle")}</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="card space-y-4 p-6 shadow-xl"
          style={{ boxShadow: "0 20px 50px -20px rgba(0,0,0,0.35)" }}
        >
          <div>
            <label htmlFor="u" className="label mb-1.5 block text-[0.62rem]">
              {t("login.username")}
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
              {t("login.password")}
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
                <IconSpinner width={16} height={16} /> {t("login.submitting")}
              </>
            ) : (
              t("login.submit")
            )}
          </button>

          {guestEnabled && (
            <>
              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
                <span className="label text-[0.56rem]">{t("login.or")}</span>
                <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
              </div>
              <button
                type="button"
                onClick={onGuest}
                disabled={guestLoading}
                className="w-full rounded-md border py-2.5 text-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                style={{ borderColor: "var(--rule)" }}
              >
                {guestLoading ? (
                  <>
                    <IconSpinner width={16} height={16} /> {t("login.guestEntering")}
                  </>
                ) : (
                  t("login.guest")
                )}
              </button>
              <p className="text-center text-[0.62rem] text-[var(--text-muted)]">{t("login.guestHint")}</p>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          {t("login.footer")}
        </p>
      </div>
    </div>
  );
}
