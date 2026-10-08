import { rn, tokens } from "@bbc/ui";

export const Club = {
  colors: {
    black: "#000000",
    primary: "#1E293B",
    surfacePanel: "#1E293B",
    surfacePage: "#F8FAFC",
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
