import { useEffect } from "react";

/**
 * Mobile keyboard workaround: when the on-screen keyboard opens, the layout
 * viewport does not shrink (especially iOS Safari), so the chat composer at
 * the bottom ends up under the keyboard. Track `window.visualViewport` and
 * expose the keyboard inset as a CSS variable `--kb` on <html>, which the
 * chat page uses as extra bottom padding.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(inset)}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--kb");
    };
  }, []);
}
