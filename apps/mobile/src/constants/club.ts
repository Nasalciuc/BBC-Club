import { rn, tokens } from "@bbc/ui";

/**
 * The entry's own colours, spacing and radii — Welcome, Sign in, Join, Verify, Set password, Reset — which the owner
 * keeps as they were (ADR-IMPL-046, ADR-IMPL-047): written here on purpose, so a change to the club's tokens does not
 * reach them by accident. The entry's type roles (`type` below) and its buttons (`ClubButton`) do read the generated
 * tokens, as everything inside the club does (`@bbc/ui`, from DESIGN.md); from here the club takes only the root's dark
 * chrome (the black behind the entry, the navigator's theme) and the column's width.
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
    // The words of an error on the navy panel: #B42318 there reads 2.23:1; this one 5.25:1 and is still red
    // (UI/UX audit, 16 Oct 2026; ADR-IMPL-047).
    statusDangerOnDark: "#F97066",
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
  // One type system on every screen (DESIGN.md, ADR-IMPL-041): Entry reads the same roles as the interior, from the
  // generated tokens, mapped to the bundled Fraunces / Geist / Geist Mono files by rn().
  type: {
    display: rn(tokens.type.display),
    headline: rn(tokens.type.headline),
    title: rn(tokens.type.title),
    titleSm: rn(tokens.type.titleSm),
    body: rn(tokens.type.body),
    bodySm: rn(tokens.type.bodySm),
    caption: rn(tokens.type.caption),
    button: rn(tokens.type.button),
    labelMono: rn(tokens.type.labelMono),
    factsMono: rn(tokens.type.factsMono),
    tabMono: rn(tokens.type.tabMono),
  },
} as const;
