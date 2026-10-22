/**
 * What a screen with a photograph at its top hands `ScreenStatusBar` (ADR-IMPL-047): `dark` — white glyphs — only while
 * a picture is under the bar; an empty photo slot (loading, an error, a city with no picture) is the light tint
 * (`surfaceTint`), where white glyphs read 1.12:1, so it is `light` — and so is the page once scrolled past the
 * photograph.
 */
export function statusBarOn(s: { hasImage: boolean; pastHero: boolean }): "light" | "dark" {
  return s.hasImage && !s.pastHero ? "dark" : "light";
}
