import { useTheme } from '../hooks/useTheme';
import type { UiStrings } from '../lib/i18n';
import { MoonIcon, SunIcon } from './Icons';

interface Props {
  t: UiStrings;
}

/**
 * Sun/moon switch. Toggles the `dark` class on <html>, persists the choice and
 * follows the OS preference until the visitor overrides it.
 */
export function ThemeToggle({ t }: Props) {
  const { theme, toggle, followingSystem } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn group"
      aria-label={t.a11y.themeToggle}
      aria-pressed={dark}
      title={`${dark ? t.a11y.darkMode : t.a11y.lightMode}${followingSystem ? ' · auto' : ''}`}
    >
      <span className="relative grid h-[18px] w-[18px] place-items-center">
        <SunIcon
          className="absolute h-[18px] w-[18px] transition-all duration-500"
          style={{
            opacity: dark ? 0 : 1,
            transform: dark ? 'rotate(-90deg) scale(0.4)' : 'rotate(0deg) scale(1)',
          }}
        />
        <MoonIcon
          className="absolute h-[18px] w-[18px] transition-all duration-500"
          style={{
            opacity: dark ? 1 : 0,
            transform: dark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.4)',
          }}
        />
      </span>
    </button>
  );
}

export default ThemeToggle;
