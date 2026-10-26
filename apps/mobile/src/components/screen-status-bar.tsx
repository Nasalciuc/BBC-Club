import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";

export { heroImageKey, statusBarOn } from "./screen-status-bar-logic";

/**
 * The status bar over the screen in view (ADR-IMPL-047): dark glyphs on the porcelain page, light ones on the night,
 * a photograph or the entry. The root keeps one light bar for the entry and Welcome; a screen that draws something
 * else mounts this while it is focused. expo-status-bar merges the mounted bars in the order they mounted, so the
 * screen in view always has the last word — a tab or a screen underneath has unmounted its own on blur. A screen with
 * a photograph under the bar picks `on` with `statusBarOn`: light glyphs only over a photograph actually drawn.
 */
export function ScreenStatusBar({ on }: { on: "light" | "dark" }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={on === "light" ? "dark" : "light"} /> : null;
}
