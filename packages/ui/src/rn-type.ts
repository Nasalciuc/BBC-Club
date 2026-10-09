import type { TextStyle } from "react-native";
import type { tokens } from "./tokens";

type TokenType = (typeof tokens)["type"][keyof (typeof tokens)["type"]];

/**
 * DESIGN.md / bun run tokens emit CSS family names ("Geist", "Fraunces").
 * Expo `useFonts` registers file-based names. Map once here so components never
 * spread raw tokens.type into StyleSheet.
 */
const FAMILY: Record<string, Record<string, string>> = {
  Fraunces: { "400": "Fraunces_400Regular", "600": "Fraunces_600SemiBold" },
  Geist: { "400": "Geist_400Regular", "500": "Geist_500Medium" },
  "Geist Mono": { "400": "GeistMono_400Regular", "500": "GeistMono_500Medium" },
};

export function rn(t: TokenType): TextStyle {
  const weight = String(t.fontWeight);
  const mapped = FAMILY[t.fontFamily]?.[weight] ?? FAMILY[t.fontFamily]?.["400"] ?? t.fontFamily;
  return {
    fontFamily: mapped,
    fontSize: t.fontSize,
    fontWeight: t.fontWeight as TextStyle["fontWeight"],
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
}
