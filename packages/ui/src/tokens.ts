// GENERATED from DESIGN.md — do not edit. Run `bun run tokens`.
export const tokens = {
  colors: {
  "primary": "#1E293B",
  "actionPrimary": "#1E293B",
  "actionInverted": "#F8FAFC",
  "surfacePage": "#F4F5F4",
  "surfaceCard": "#FFFFFF",
  "surfacePanel": "#1E293B",
  "surfaceMuted": "#334155",
  "textPrimary": "#1E293B",
  "textSecondary": "#64748B",
  "textTertiary": "#94A3B8",
  "textOnDark": "#F8FAFC",
  "textOnDarkMuted": "#94A3B8",
  "borderDefault": "#E2E8F0",
  "statusDanger": "#B42318",
  "accentWarm": "#9A7B4F",
  "scrim": "rgba(15,23,42,0.78)"
},
  type: {
  "display": {
    "fontFamily": "Fraunces",
    "fontSize": 34,
    "fontWeight": "400",
    "lineHeight": 37,
    "letterSpacing": -0.4
  },
  "headline": {
    "fontFamily": "Fraunces",
    "fontSize": 28,
    "fontWeight": "400",
    "lineHeight": 32,
    "letterSpacing": -0.3
  },
  "title": {
    "fontFamily": "Fraunces",
    "fontSize": 20,
    "fontWeight": "400",
    "lineHeight": 24,
    "letterSpacing": 0
  },
  "titleSm": {
    "fontFamily": "Fraunces",
    "fontSize": 16,
    "fontWeight": "400",
    "lineHeight": 20,
    "letterSpacing": 0
  },
  "body": {
    "fontFamily": "Geist",
    "fontSize": 17,
    "fontWeight": "400",
    "lineHeight": 25,
    "letterSpacing": 0
  },
  "bodySm": {
    "fontFamily": "Geist",
    "fontSize": 15,
    "fontWeight": "400",
    "lineHeight": 21,
    "letterSpacing": 0
  },
  "caption": {
    "fontFamily": "Geist",
    "fontSize": 13,
    "fontWeight": "400",
    "lineHeight": 18,
    "letterSpacing": 0
  },
  "price": {
    "fontFamily": "Geist",
    "fontSize": 24,
    "fontWeight": "500",
    "lineHeight": 26,
    "letterSpacing": -0.2
  },
  "priceStruck": {
    "fontFamily": "Geist",
    "fontSize": 14,
    "fontWeight": "400",
    "lineHeight": 17,
    "letterSpacing": 0
  },
  "button": {
    "fontFamily": "Geist",
    "fontSize": 17,
    "fontWeight": "500",
    "lineHeight": 17,
    "letterSpacing": 0
  },
  "labelMono": {
    "fontFamily": "Geist Mono",
    "fontSize": 11,
    "fontWeight": "500",
    "lineHeight": 14,
    "letterSpacing": 1.5
  },
  "factsMono": {
    "fontFamily": "Geist Mono",
    "fontSize": 12,
    "fontWeight": "400",
    "lineHeight": 17,
    "letterSpacing": 1
  },
  "tabMono": {
    "fontFamily": "Geist Mono",
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
