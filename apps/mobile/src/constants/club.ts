import type { TextStyle } from "react-native";

/**
 * The entry's own values — Welcome, Sign in, Join, Verify, Set password, Reset — which the owner keeps exactly as they
 * were in 1.0 (ADR-IMPL-046, ADR-IMPL-047): colours, spacing, radii, type, motion, all written here, so the club's
 * tokens can move to 3.0 (ADR-IMPL-055) without touching the entry. Nothing here reads `@bbc/ui`'s tokens; the entry's
 * components (`ClubButton`, `ClubIcon`, `AnimatedEntrance`) read only this file, and `club.test.ts` pins every value.
 * From here the club takes only the root's dark chrome (the black behind the entry, the navigator's theme) and the
 * column's width.
 */
export const Club = {
  colors: {
    black: "#000000",
    primary: "#1E293B",
    surfacePanel: "#1E293B",
    surfaceCard: "#FFFFFF",
    surfaceMuted: "#334155",
    textPrimary: "#1E293B",
    textSecondary: "#64748B",
    textTertiary: "#94A3B8",
    textOnDark: "#F8FAFC",
    textOnDarkMuted: "#94A3B8",
    actionInverted: "#F8FAFC",
    statusDanger: "#B42318",
    borderDefault: "#E2E8F0",
    borderOnDark: "rgba(248,250,252,0.35)",
    heroDim: "rgba(30,41,59,0.4)",
    scrim: ["transparent", "rgba(30,41,59,0.8)", "#1E293B"] as const,
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    gutter: 24,
  },
  radius: {
    badge: 4,
    field: 12,
    card: 12,
    panel: 24,
    pill: 999,
  },
  layout: {
    phoneMaxWidth: 430,
  },
  // The 1.0 type roles as the entry draws them: the bundled Fraunces, Geist and Geist Mono files (ADR-IMPL-041), the
  // sizes, weights, line heights and tracking DESIGN.md 1.0 generated — frozen, not read from the tokens.
  type: {
    display: {
      fontFamily: "Fraunces_400Regular",
      fontSize: 34,
      fontWeight: "400",
      lineHeight: 37,
      letterSpacing: -0.4,
    },
    headline: {
      fontFamily: "Fraunces_400Regular",
      fontSize: 28,
      fontWeight: "400",
      lineHeight: 32,
      letterSpacing: -0.3,
    },
    // Welcome's headline, one sentence a line on a 393-pt phone (the owner, 21 Oct; ADR-IMPL-047): `Eight hours in a
    // lie-flat suite.` measures 366 pt at 28 and 339 at 26. Verify keeps `headline`.
    welcome: {
      fontFamily: "Fraunces_400Regular",
      fontSize: 26,
      fontWeight: "400",
      lineHeight: 30,
      letterSpacing: -0.3,
    },
    title: { fontFamily: "Fraunces_400Regular", fontSize: 20, fontWeight: "400", lineHeight: 24, letterSpacing: 0 },
    titleSm: { fontFamily: "Fraunces_400Regular", fontSize: 16, fontWeight: "400", lineHeight: 20, letterSpacing: 0 },
    body: { fontFamily: "Geist_400Regular", fontSize: 17, fontWeight: "400", lineHeight: 25, letterSpacing: 0 },
    bodySm: { fontFamily: "Geist_400Regular", fontSize: 15, fontWeight: "400", lineHeight: 21, letterSpacing: 0 },
    caption: { fontFamily: "Geist_400Regular", fontSize: 13, fontWeight: "400", lineHeight: 18, letterSpacing: 0 },
    button: { fontFamily: "Geist_500Medium", fontSize: 17, fontWeight: "500", lineHeight: 17, letterSpacing: 0 },
    labelMono: {
      fontFamily: "GeistMono_500Medium",
      fontSize: 11,
      fontWeight: "500",
      lineHeight: 14,
      letterSpacing: 1.5,
    },
    factsMono: {
      fontFamily: "GeistMono_400Regular",
      fontSize: 12,
      fontWeight: "400",
      lineHeight: 17,
      letterSpacing: 1,
    },
    tabMono: { fontFamily: "GeistMono_500Medium", fontSize: 11, fontWeight: "500", lineHeight: 13, letterSpacing: 1 },
  } satisfies Record<string, TextStyle>,
  /** The entrance: each element fades in over 900 ms and rises 12 pt (design/motion.md 1.0). */
  motion: {
    entrance: 900,
    rise: 12,
  },
} as const;
