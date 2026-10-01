import { useEffect, useRef, useState } from "react";
import { useUi } from "../stores/ui";
import { useAdminSkin, SKIN_IDS, type SkinId } from "../hooks/useAdminSkin";
import { useT } from "../lib/i18n";
import { IconSun, IconMoon, IconMonitor } from "./icons";

/** Skin ids in i18n: appearance.skinClassic / skinModern / skinEmerald. */
const SKIN_KEY: Record<SkinId, string> = {
  classic: "appearance.skinClassic",
  modern: "appearance.skinModern",
  emerald: "appearance.skinEmerald",
};

const SKIN_SWATCH: Record<SkinId, [string, string]> = {
  classic: ["#e9e2d3", "#b4441c"],
  modern: ["#f4f5f8", "#4f46e5"],
  emerald: ["#eceee6", "#1d6b4f"],
};

/**
 * Appearance button. Click opens a popover where the admin picks BOTH the
 * light/dark theme and one of three visual skins for the admin portal itself.
 * (The recruiter portal's look is chosen by its visitors client-side.)
 */
export default function ThemeToggle() {
  const t = useT();
  const theme = useUi((s) => s.theme);
  const themeChoice = useUi((s) => s.themeChoice);
  const setThemeChoice = useUi((s) => s.setThemeChoice);
  const { skin, setSkin } = useAdminSkin();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dark = theme === "dark";

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("appearance.title")}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t("appearance.title")}
        className="focus-ring relative grid h-9 w-9 place-items-center rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ borderColor: "var(--rule)", color: "var(--text-muted)" }}
      >
        <span
          className="transition-transform duration-300"
          style={{ transform: dark ? "rotate(-40deg)" : "rotate(0deg)" }}
        >
          {dark ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
        </span>
        {/* dot indicator when a non-default skin is active */}
        {skin !== "classic" && (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={t("appearance.title")}
          className="absolute right-0 top-[calc(100%+8px)] z-[70] w-60 rounded-lg border p-3"
          style={{
            borderColor: "var(--rule)",
            background: "var(--surface)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
          }}
        >
          {/* Theme: light / system / dark */}
          <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            {t("appearance.theme")}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("appearance.theme")}>
            {([
              { choice: "light", label: t("appearance.light"), Icon: IconSun },
              { choice: "system", label: t("appearance.system"), Icon: IconMonitor },
              { choice: "dark", label: t("appearance.dark"), Icon: IconMoon },
            ] as const).map(({ choice, label, Icon }) => {
              const active = themeChoice === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (!active) setThemeChoice(choice);
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[0.7rem] transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--rule)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  <Icon width={14} height={14} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Skin: three visual styles */}
          <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            {t("appearance.style")}
          </div>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label={t("appearance.style")}>
            {SKIN_IDS.map((id) => {
              const swatch = SKIN_SWATCH[id];
              const active = skin === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSkin(id)}
                  className="flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[0.78rem] transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--rule)",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span
                    className="flex flex-none overflow-hidden rounded-sm border"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    {swatch.map((c) => (
                      <span key={c} style={{ width: 10, height: 18, background: c }} />
                    ))}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={active ? { color: "var(--accent)" } : undefined}
                  >
                    {t(SKIN_KEY[id])}
                  </span>
                  {active && <span className="flex-none text-[0.6rem] text-[var(--accent)]">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
