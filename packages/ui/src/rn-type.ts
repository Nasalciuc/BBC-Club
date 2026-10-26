import { Platform, type TextStyle } from "react-native";
import { lineBaseline } from "./rn-type-baseline";
import type { tokens } from "./tokens";

type TokenType = (typeof tokens)["type"][keyof (typeof tokens)["type"]];

/**
 * DESIGN.md names the family (`Inter Tight`); Expo's `useFonts` registers each weight as a family of its own
 * (`InterTight_700Bold`). Map once here, so components never spread raw `tokens.type` into a StyleSheet. The weight is the
 * file's: no `fontWeight` goes with it, or Android and the web would embolden a font that is already bold.
 */
const FAMILY: Record<string, Record<string, string>> = {
  "Inter Tight": {
    "400": "InterTight_400Regular",
    "500": "InterTight_500Medium",
    "600": "InterTight_600SemiBold",
    "700": "InterTight_700Bold",
  },
};

export function rn(t: TokenType): TextStyle {
  const weight = String(t.fontWeight);
  const mapped = FAMILY[t.fontFamily]?.[weight] ?? FAMILY[t.fontFamily]?.["400"] ?? t.fontFamily;
  const style: TextStyle = {
    fontFamily: mapped,
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
  if ("fontVariant" in t) style.fontVariant = [...t.fontVariant];
  return style;
}

/**
 * How far below the top of its box a line of this style sets its baseline. The screens are measured by their
 * baselines (ADR-IMPL-056); a margin of `baseline − baselineOffset(style)` puts a text exactly where the image draws
 * it. Android and the web split the line's extra height evenly above and below the glyphs — a line shorter than the
 * font's own takes the overlap evenly too. iOS centres the glyphs only in a line at least as tall as the font's own
 * (React Native's `RCTApplyBaselineOffset`); in a shorter one CoreText keeps the descent at the line's foot, so the
 * baseline stands the font's descent above the bottom.
 */
export function baselineOffset(t: { fontSize: number; lineHeight: number }): number {
  return lineBaseline(t, Platform.OS);
}

/** The distance from a box's baseline to its bottom edge (the line's own room under the baseline). */
export function belowBaseline(t: { fontSize: number; lineHeight: number }): number {
  return t.lineHeight - baselineOffset(t);
}
