import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n, useT } from "../lib/i18n";
import type { UiLang } from "../lib/i18n";

/**
 * Segmented 中/EN switch with a sliding thumb — mirrors the recruiter
 * portal's LanguageSwitch, including the compact mobile labels
 * (中文→中, English→EN below 640px).
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

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumb, setThumb] = useState({ left: 2, width: 0 });

  const items: UiLang[] = ["zh", "en"];
  const labelFor = (l: UiLang) => (isCompact ? LABELS_SHORT[l] : LABELS[l]);

  const measure = () => {
    const wrap = wrapRef.current;
    const active = btnRefs.current[items.indexOf(lang)];
    if (!wrap || !active) return;
    const wrapBox = wrap.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    setThumb({ left: box.left - wrapBox.left, width: box.width });
  };

  useLayoutEffect(measure, [lang, isCompact]);

  useEffect(() => {
    if (typeof document.fonts?.ready?.then === "function") {
      document.fonts.ready.then(measure).catch(() => undefined);
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={t("a11y.uiLanguage")}
      style={{
        position: "relative",
        display: "inline-flex",
        border: "1px solid var(--rule)",
        borderRadius: 3,
        padding: 2,
        background: "var(--surface)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: thumb.left,
          width: thumb.width,
          background: "var(--accent)",
          borderRadius: 2,
          transition: "left 0.34s cubic-bezier(0.16,1,0.3,1), width 0.34s cubic-bezier(0.16,1,0.3,1)",
          zIndex: 0,
        }}
      />
      {items.map((l, i) => (
        <button
          key={l}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
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
            color: lang === l ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {labelFor(l)}
        </button>
      ))}
    </div>
  );
}
