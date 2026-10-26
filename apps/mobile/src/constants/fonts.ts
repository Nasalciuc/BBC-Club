/**
 * The font files the app draws with, by the family name its styles use (ADR-IMPL-072): Inter Tight inside the club
 * (`rn()` in `@bbc/ui` maps `Inter Tight` and a weight to one of these), and the entry's own Fraunces, Geist and Geist
 * Mono (`constants/club.ts`, ADR-IMPL-047). Two consumers read this list and must agree:
 *
 * - the root layout loads each file under its name with `useFonts` (every build, every OTA update);
 * - the `expo-font` config plugin in `app.json` embeds the same files in the Android build, where a font's family is
 *   its file's name — so a file must be named exactly as its family (`InterTight_400Regular.ttf`).
 *
 * `fonts.test.ts` keeps the two equal, and every family `club.ts` or the tokens use in it.
 */
export const CLUB_FONT_FILES = {
  InterTight_400Regular: "@expo-google-fonts/inter-tight/400Regular/InterTight_400Regular.ttf",
  InterTight_500Medium: "@expo-google-fonts/inter-tight/500Medium/InterTight_500Medium.ttf",
  InterTight_600SemiBold: "@expo-google-fonts/inter-tight/600SemiBold/InterTight_600SemiBold.ttf",
  InterTight_700Bold: "@expo-google-fonts/inter-tight/700Bold/InterTight_700Bold.ttf",
  Fraunces_400Regular: "@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf",
  Geist_400Regular: "@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf",
  Geist_500Medium: "@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf",
  GeistMono_400Regular: "@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf",
  GeistMono_500Medium: "@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf",
} as const;

export type ClubFontFamily = keyof typeof CLUB_FONT_FILES;
