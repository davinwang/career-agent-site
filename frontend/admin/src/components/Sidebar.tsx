import { NavLink } from "react-router-dom";
import { useUi } from "../stores/ui";
import { useT } from "../lib/i18n";
import {
  IconChat,
  IconSessions,
  IconDashboard,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  to: string;
  labelKey: string;
  hintKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", hintKey: "nav.dashboardHint", Icon: IconDashboard },
  { to: "/chat", labelKey: "nav.chat", hintKey: "nav.chatHint", Icon: IconChat },
  { to: "/sessions", labelKey: "nav.sessions", hintKey: "nav.sessionsHint", Icon: IconSessions },
];

function Brand({ collapsed, brand }: { collapsed: boolean; brand: string }) {
  return (
    <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md font-display text-lg font-bold"
        style={{ background: "var(--accent)", color: "var(--color-paper-50)" }}
      >
        JA
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[0.95rem] font-semibold tracking-tight">
            {brand}
          </div>
          <div className="label text-[0.6rem]">Admin Console</div>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  /** Mobile overlay variant hides the collapse affordance. */
  variant?: "desktop" | "mobile";
}

export default function Sidebar({ variant = "desktop" }: SidebarProps) {
  const collapsed = useUi((s) => s.collapsed) && variant === "desktop";
  const t = useT();

  return (
    <nav className="flex h-full flex-col gap-6 py-5" aria-label={t("nav.mainNav")}>
      <div className={collapsed ? "px-3" : "px-5"}>
        <Brand collapsed={collapsed} brand={t("login.title")} />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {!collapsed && <div className="label px-2 pb-1">{t("nav.menu")}</div>}
        {NAV.map(({ to, labelKey, hintKey, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? t(labelKey) : undefined}
            className={({ isActive }) =>
              [
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-all duration-150",
                collapsed ? "justify-center" : "",
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <span
                  className="shrink-0 transition-transform duration-150 group-hover:scale-110"
                  style={isActive ? { color: "var(--accent)" } : undefined}
                >
                  <Icon width={19} height={19} />
                </span>
                {!collapsed && (
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{t(labelKey)}</span>
                    <span className="label truncate text-[0.58rem]">{t(hintKey)}</span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {!collapsed && (
        <div className="px-5">
          <div
            className="rounded-md border p-3 text-[0.68rem] leading-relaxed"
            style={{ borderColor: "var(--rule)", color: "var(--text-muted)" }}
          >
            <span className="label text-[0.58rem]">{t("nav.status")}</span>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="dot h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-moss-500)" }}
              />
              {t("nav.connected")}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
