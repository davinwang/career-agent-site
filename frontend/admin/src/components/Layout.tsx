import { useEffect } from "react";
import type { CSSProperties } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useUi } from "../stores/ui";
import { useAuth } from "../stores/auth";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import LangSwitch from "./LangSwitch";
import { useT } from "../lib/i18n";
import { IconMenu, IconClose, IconLogout, IconChevron } from "./icons";

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const collapsed = useUi((s) => s.collapsed);
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const mobileOpen = useUi((s) => s.mobileOpen);
  const setMobileOpen = useUi((s) => s.setMobileOpen);
  const username = useAuth((s) => s.username);
  const logout = useAuth((s) => s.logout);
  const t = useT();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  const titleKey =
    pathname === "/" ? "nav.dashboard" : pathname.startsWith("/chat") ? "nav.chat" : pathname.startsWith("/sessions") ? "nav.sessions" : "nav.adminTitle";
  const titleEnKey =
    pathname === "/" ? "nav.dashboardHint" : pathname.startsWith("/chat") ? "nav.chatTitle" : pathname.startsWith("/sessions") ? "nav.sessionsTitle" : "nav.adminTitle";
  const rail = collapsed ? "4rem" : "15rem";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const rootStyle = { "--rail": rail } as CSSProperties;

  return (
    <div className="relative min-h-screen" style={rootStyle}>
      {/* Offset the main column by the sidebar width on desktop only. */}
      <style>{`@media (min-width: 1024px) { .admin-col { margin-left: var(--rail); } }`}</style>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden border-r transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block"
        style={{ width: rail, background: "var(--surface)", borderColor: "var(--rule)" }}
      >
        <Sidebar variant="desktop" />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          className="focus-ring absolute -right-3 top-7 grid h-6 w-6 place-items-center rounded-full border shadow-sm transition-colors hover:text-[var(--accent)]"
          style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
        >
          <IconChevron
            width={14}
            height={14}
            style={{ transform: collapsed ? "none" : "rotate(180deg)" }}
          />
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="slide-in absolute inset-y-0 left-0 w-[16rem] border-r"
            style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t("nav.closeMenu")}
              className="absolute right-3 top-5 grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)]"
            >
              <IconClose width={18} height={18} />
            </button>
            <Sidebar variant="mobile" />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="admin-col flex min-h-screen flex-col">
        <header
          className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b px-4 backdrop-blur-md sm:px-6"
          style={{
            borderColor: "var(--rule)",
            background: "color-mix(in srgb, var(--bg) 82%, transparent)",
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.openMenu")}
              className="focus-ring grid h-9 w-9 place-items-center rounded-md border lg:hidden"
              style={{ borderColor: "var(--rule)" }}
            >
              <IconMenu width={18} height={18} />
            </button>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
                {t(titleKey)}
              </h1>
              <div className="label hidden text-[0.6rem] sm:block">{t(titleEnKey)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {username && <span className="label hidden text-[0.62rem] md:block">@{username}</span>}
            <LangSwitch />
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t("nav.logout")}
              title={t("nav.logout")}
              className="focus-ring grid h-9 w-9 place-items-center rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--rule)", color: "var(--text-muted)" }}
            >
              <IconLogout width={18} height={18} />
            </button>
          </div>
        </header>

        <main className="relative z-10 flex-1">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
