// Light / dark mode, per device (like the remembered user), not per account.
// "system" follows the phone's own setting, live.

export type Theme = "system" | "light" | "dark";

const KEY = "rack.theme";
const CHANGED = "rack-theme-change";

// Runs in <head> before the first paint, so a dark phone never flashes white. It also re-applies the
// theme whenever the phone switches light/dark, or setTheme() below announces a change.
export const THEME_SCRIPT = `(function () {
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var theme = "system";
    try { theme = localStorage.getItem("${KEY}") || "system"; } catch (e) {}
    var dark = theme === "dark" || (theme === "system" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("${CHANGED}", apply);
})();`;

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return "system";
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

// For useSyncExternalStore: re-render the Settings picker when the theme changes.
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

// Ask the <head> script to re-apply the saved theme now.
export function reapplyTheme() {
  window.dispatchEvent(new Event(CHANGED));
}
