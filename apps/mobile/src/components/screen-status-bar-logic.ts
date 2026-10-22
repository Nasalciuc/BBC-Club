/**
 * Which status bar a screen with a photograph under the bar mounts (`ScreenStatusBar`'s `on`) — pure, so it is tested
 * without React Native. Light glyphs (`dark`) only over a photograph actually drawn: with none (no home airport, a city
 * without one), while it loads, or after it failed, the slot is the light tint, where white glyphs read at 1.12:1
 * (F022, F028); and once the page has scrolled past it, the page is under the bar.
 */
export function statusBarOn(s: { hasImage: boolean; loaded: boolean; pastHero: boolean }): "light" | "dark" {
  return !s.pastHero && s.hasImage && s.loaded ? "dark" : "light";
}

/** Which photograph a load or a failure was for — a remote one by its address, a bundled one by its asset number. */
export function heroImageKey(source: { uri: string } | number | null | undefined): string | null {
  if (source == null) return null;
  return typeof source === "number" ? `asset:${source}` : source.uri;
}
