import { useEffect, useRef, useState } from "react";
import { useUi } from "../stores/ui";
import { useAdminSkin, SKIN_IDS, type SkinId } from "../hooks/useAdminSkin";
import { IconSun, IconMoon } from "./icons";

const SKIN_META: Record<SkinId, { label: string; swatch: [string, string] }> = {
  classic: { label: "经典报纸", swatch: ["#e9e2d3", "#b4441c"] },
  modern: { label: "现代简约", swatch: ["#f4f5f8", "#4f46e5"] },
  emerald: { label: "墨绿典雅", swatch: ["#eceee6", "#1d6b4f"] },
};

/**
 * Appearance button. Click opens a popover where the admin picks BOTH the
 * light/dark theme and one of three visual skins for the admin portal itself.
 * (The recruiter portal's look is chosen by its visitors client-side.)
 */
export default function ThemeToggle() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
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
        aria-label="外观设置"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="主题与样式"
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
          aria-label="外观设置"
          className="absolute right-0 top-[calc(100%+8px)] z-[70] w-60 rounded-lg border p-3"
          style={{
            borderColor: "var(--rule)",
            background: "var(--surface)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
          }}
        >
          {/* Theme: light / dark */}
          <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            主题
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1" role="radiogroup" aria-label="主题">
            {(["light", "dark"] as const).map((mode) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (!active) toggleTheme();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[0.72rem] transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--rule)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {mode === "light" ? <IconSun width={14} height={14} /> : <IconMoon width={14} height={14} />}
                  {mode === "light" ? "浅色" : "深色"}
                </button>
              );
            })}
          </div>

          {/* Skin: three visual styles */}
          <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            样式
          </div>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="样式">
            {SKIN_IDS.map((id) => {
              const meta = SKIN_META[id];
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
                    {meta.swatch.map((c) => (
                      <span key={c} style={{ width: 10, height: 18, background: c }} />
                    ))}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={active ? { color: "var(--accent)" } : undefined}
                  >
                    {meta.label}
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
