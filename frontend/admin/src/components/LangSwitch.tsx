import { useI18n, useT } from "../lib/i18n";
import type { UiLang } from "../lib/i18n";

/** Compact UI-language toggle: 中 / EN. Persisted via the i18n module. */
export default function LangSwitch() {
  const t = useT();
  const { setLanguage } = useI18n();
  const toggle = () => {
    const next: UiLang = t.lang === "zh" ? "en" : "zh";
    setLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("a11y.uiLanguage")}
      title={t("a11y.uiLanguage")}
      className="focus-ring label flex h-8 items-center gap-1 rounded-md border px-2 text-[0.6rem] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{ borderColor: "var(--rule)" }}
    >
      <span className={t.lang === "zh" ? "font-bold text-[var(--accent)]" : "opacity-60"}>中</span>
      <span className="opacity-40">/</span>
      <span className={t.lang === "en" ? "font-bold text-[var(--accent)]" : "opacity-60"}>EN</span>
    </button>
  );
}
