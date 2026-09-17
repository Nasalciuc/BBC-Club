import type { TextStyle } from "react-native";
import type { tokens } from "./tokens";

type TokenType = (typeof tokens)["type"][keyof (typeof tokens)["type"]];

/**
 * DESIGN.md / bun run tokens emit CSS family names ("Inter", "Newsreader").
 * Expo `useFonts` registers file-based names. Map once here so components never
 * spread raw tokens.type into StyleSheet.
 */
const FAMILY: Record<string, Record<string, string>> = {
  Newsreader: { "400": "SourceSerif4_400Regular" },
  Inter: { "400": "Inter_400Regular", "500": "Inter_500Medium" },
  "JetBrains Mono": { "400": "JetBrainsMono_400Regular", "500": "JetBrainsMono_500Medium" },
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
