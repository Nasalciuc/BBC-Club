export const Club = {
  colors: {
    black: "#000000",
    navy: "#1E293B",
    navyDeep: "#091426",
    mist: "#F8FAFC",
    background: "#F7F9FB",
    secondary: "#505F76",
    onPrimaryContainer: "#8590A6",
    outline: "#75777D",
    outlineVariant: "#C5C6CD",
    white: "#FFFFFF",
  },
  space: {
    gutter: 16,
    stackSm: 12,
    stackMd: 24,
    stackLg: 40,
    margin: 24,
  },
  radius: {
    input: 12,
    panel: 32,
    panelTight: 24,
    pill: 999,
  },
  type: {
    headline: {
      fontFamily: "SourceSerif4_600SemiBold",
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.6,
    },
    headlineLg: {
      fontFamily: "SourceSerif4_600SemiBold",
      fontSize: 34,
      lineHeight: 40,
      letterSpacing: -0.68,
    },
    headlineMd: {
      fontFamily: "SourceSerif4_600SemiBold",
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.28,
    },
    bodyLg: {
      fontFamily: "Inter_400Regular",
      fontSize: 19,
      lineHeight: 28,
    },
    body: {
      fontFamily: "Inter_400Regular",
      fontSize: 17,
      lineHeight: 26,
    },
    bodySm: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,
    },
    button: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 17,
      lineHeight: 24,
    },
    label: {
      fontFamily: "JetBrainsMono_500Medium",
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.2,
    },
  },
} as const;
