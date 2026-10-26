/**
 * The cold start's font gate (ADR-IMPL-072). React Native lays a text out once, in the font it has when the text is
 * first drawn, and does not lay it out again when that font arrives later: Welcome drawn before `useFonts` has the
 * club's files stays in the system font. So the splash stays up, and the screens' content waits, until the fonts are
 * in, a font failed, or the cap passed — whichever comes first. The session never holds it (its get-session has no
 * timeout: waiting for it was the 23 Sep white screen, f26870c), nor does the network.
 */

/** How long the splash waits for the fonts at most. On a cap or a font error the app goes on in the system font. */
export const FONT_WAIT_CAP_MS = 3000;

/** What the gate reads: `useFonts`' answer and whether the cap passed. Nothing else. */
export type FontGateInput = {
  /** `useFonts`' first value: every font of the map is registered. */
  fontsLoaded: boolean;
  /** `useFonts`' second value: a font failed to load. */
  fontError: Error | null;
  capPassed: boolean;
};

/** Why the gate opened: the fonts are in, a font failed, or the cap passed first. */
export type FontGateReason = "fonts" | "error" | "cap";

/** Why the screens may draw now, or null while they wait. The fonts are read first: a cap that passes in the same
 *  render as the fonts arrive still counts as the fonts. */
export function fontGateReason({ fontsLoaded, fontError, capPassed }: FontGateInput): FontGateReason | null {
  if (fontsLoaded) return "fonts";
  if (fontError) return "error";
  if (capPassed) return "cap";
  return null;
}

/** Whether the screens may draw: the splash hides and each screen's content mounts. It never closes again — each
 *  of the three only ever turns true. */
export function fontGateOpen(input: FontGateInput): boolean {
  return fontGateReason(input) !== null;
}
