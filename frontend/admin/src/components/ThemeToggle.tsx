import { useUi } from "../stores/ui";
import { IconSun, IconMoon } from "./icons";

/** Sun/moon switch that flips the `dark` class on <html>. */
export default function ThemeToggle() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
      title={dark ? "浅色模式" : "深色模式"}
      className="focus-ring relative grid h-9 w-9 place-items-center rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{ borderColor: "var(--rule)", color: "var(--text-muted)" }}
    >
      <span
        className="transition-transform duration-300"
        style={{ transform: dark ? "rotate(-40deg)" : "rotate(0deg)" }}
      >
        {dark ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
      </span>
    </button>
  );
}
