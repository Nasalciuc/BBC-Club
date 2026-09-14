// GENERATED from DESIGN.md — do not edit. Run `bun run tokens`.
export const tokens = {
  colors: {
  "primary": "#1E293B",
  "actionPrimary": "#1E293B",
  "actionInverted": "#F8FAFC",
  "surfacePage": "#F8FAFC",
  "surfaceCard": "#FFFFFF",
  "surfacePanel": "#1E293B",
  "surfaceMuted": "#334155",
  "textPrimary": "#1E293B",
  "textSecondary": "#64748B",
  "textTertiary": "#94A3B8",
  "textOnDark": "#F8FAFC",
  "textOnDarkMuted": "#94A3B8",
  "borderDefault": "#E2E8F0",
  "statusDanger": "#B42318"
},
  type: {
  "display": {
    "fontFamily": "Newsreader",
    "fontSize": 34,
    "fontWeight": "400",
    "lineHeight": 37,
    "letterSpacing": -0.4
  },
  "headline": {
    "fontFamily": "Newsreader",
    "fontSize": 28,
    "fontWeight": "400",
    "lineHeight": 32,
    "letterSpacing": -0.3
  },
  "title": {
    "fontFamily": "Newsreader",
    "fontSize": 20,
    "fontWeight": "400",
    "lineHeight": 24,
    "letterSpacing": 0
  },
  "titleSm": {
    "fontFamily": "Newsreader",
    "fontSize": 16,
    "fontWeight": "400",
    "lineHeight": 20,
    "letterSpacing": 0
  },
  "body": {
    "fontFamily": "Inter",
    "fontSize": 17,
    "fontWeight": "400",
    "lineHeight": 25,
    "letterSpacing": 0
  },
  "bodySm": {
    "fontFamily": "Inter",
    "fontSize": 15,
    "fontWeight": "400",
    "lineHeight": 21,
    "letterSpacing": 0
  },
  "caption": {
    "fontFamily": "Inter",
    "fontSize": 13,
    "fontWeight": "400",
    "lineHeight": 18,
    "letterSpacing": 0
  },
  "price": {
    "fontFamily": "Inter",
    "fontSize": 24,
    "fontWeight": "500",
    "lineHeight": 26,
    "letterSpacing": -0.2
  },
  "priceStruck": {
    "fontFamily": "Inter",
    "fontSize": 14,
    "fontWeight": "400",
    "lineHeight": 17,
    "letterSpacing": 0
  },
  "button": {
    "fontFamily": "Inter",
    "fontSize": 17,
    "fontWeight": "500",
    "lineHeight": 17,
    "letterSpacing": 0
  },
  "labelMono": {
    "fontFamily": "JetBrains Mono",
    "fontSize": 11,
    "fontWeight": "500",
    "lineHeight": 14,
    "letterSpacing": 1.5
  },
  "factsMono": {
    "fontFamily": "JetBrains Mono",
    "fontSize": 12,
    "fontWeight": "400",
    "lineHeight": 17,
    "letterSpacing": 1
  },
  "tabMono": {
    "fontFamily": "JetBrains Mono",
    "fontSize": 9,
    "fontWeight": "500",
    "lineHeight": 9,
    "letterSpacing": 1
  }
},
  radius: {
  "badge": 4,
  "field": 12,
  "card": 12,
  "panel": 24,
  "pill": 999
},
  space: {
  "xxs": 4,
  "xs": 8,
  "sm": 12,
  "md": 16,
  "lg": 24,
  "xl": 32,
  "xxl": 48
},
} as const;
export type ColorToken = keyof typeof tokens.colors;
export type TypeToken = keyof typeof tokens.type;
