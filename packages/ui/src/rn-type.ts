import type { TextStyle } from "react-native";
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
