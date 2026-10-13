import { useEffect, useState, type CSSProperties } from "react";
import { useI18n, useT } from "../lib/i18n";
import type { UiLang } from "../lib/i18n";

/**
 * Segmented 中/EN switch with a sliding thumb — mirrors the recruiter
 * portal's LanguageSwitch: equal-width CSS grid, thumb positioned purely
 * from custom properties (no JS measuring, so it can never drift out of
 * sync with the pressed state), compact labels below 640px.
 */

const LABELS: Record<UiLang, string> = { zh: "中文", en: "English" };
const LABELS_SHORT: Record<UiLang, string> = { zh: "中", en: "EN" };

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function LangSwitch() {
  const t = useT();
  const { lang, setLanguage } = useI18n();
  const isCompact = !useMediaQuery("(min-width: 640px)");

  const items: UiLang[] = ["zh", "en"];
  const activeIndex = Math.max(0, items.indexOf(lang as UiLang));
  const labelFor = (l: UiLang) => (isCompact ? LABELS_SHORT[l] : LABELS[l]);

  return (
    <div
      role="group"
      aria-label={t("a11y.uiLanguage")}
      style={
        {
          position: "relative",
          display: "inline-grid",
          gridAutoFlow: "column",
          gridAutoColumns: "1fr",
          border: "1px solid var(--rule)",
          borderRadius: 3,
          padding: 2,
          background: "var(--surface)",
          "--seg-count": items.length,
          "--seg-index": activeIndex,
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: 2,
          width: "calc((100% - 4px) / var(--seg-count, 2))",
          transform: "translateX(calc(var(--seg-index, 0) * 100%))",
          background: "var(--accent)",
          borderRadius: 2,
          transition: "transform 0.34s cubic-bezier(0.16,1,0.3,1)",
          zIndex: 0,
        }}
      />
      {items.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLanguage(l)}
          style={{
            position: "relative",
            zIndex: 1,
            padding: "0.22rem 0.6rem",
            border: 0,
            background: "transparent",
            borderRadius: 2,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            cursor: "pointer",
            transition: "color 0.24s ease",
            color: lang === l ? "var(--color-paper-50, #fff)" : "var(--text-muted)",
          }}
        >
          {labelFor(l)}
        </button>
      ))}
    </div>
  );
}
