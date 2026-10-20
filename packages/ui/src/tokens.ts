// GENERATED from DESIGN.md — do not edit. Run `bun run tokens`.
export const tokens = {
  colors: {
  "primary": "#1E293B",
  "actionPrimary": "#1E293B",
  "actionPressed": "#0F172A",
  "surfacePage": "#FAFAF8",
  "surfaceCard": "#FFFFFF",
  "surfaceTint": "#F1F5F9",
  "borderDefault": "#E2E8F0",
  "textPrimary": "#1E293B",
  "textSecondary": "#64748B",
  "textOnTint": "#475569",
  "textOnPhoto": "#FFFFFF",
  "statusDanger": "#EF4444",
  "statusDangerText": "#DC2626",
  "statusDangerTint": "#FEF2F2",
  "sky": "#BAD2EB",
  "scrim": "rgba(15,23,42,0.40)",
  "photoVeil": "rgba(15,23,42,0.45)",
  "shadow": "#1E293B",
  "globeOcean": "#1B5E9E",
  "globeOceanDeep": "#0B3F73",
  "globeLand": "#8FA77A",
  "globeDesert": "#E5D3B0",
  "globeIce": "#F4F7FA"
},
  type: {
  "display": {
    "fontFamily": "Inter Tight",
    "fontSize": 36,
    "fontWeight": "700",
    "lineHeight": 40,
    "letterSpacing": -0.8
  },
  "headline": {
    "fontFamily": "Inter Tight",
    "fontSize": 30,
    "fontWeight": "700",
    "lineHeight": 35,
    "letterSpacing": -0.6
  },
  "title": {
    "fontFamily": "Inter Tight",
    "fontSize": 24,
    "fontWeight": "700",
    "lineHeight": 29,
    "letterSpacing": -0.4
  },
  "titleSm": {
    "fontFamily": "Inter Tight",
    "fontSize": 20,
    "fontWeight": "700",
    "lineHeight": 25,
    "letterSpacing": -0.3
  },
  "subtitle": {
    "fontFamily": "Inter Tight",
    "fontSize": 17,
    "fontWeight": "600",
    "lineHeight": 22,
    "letterSpacing": -0.2
  },
  "greeting": {
    "fontFamily": "Inter Tight",
    "fontSize": 26,
    "fontWeight": "400",
    "lineHeight": 31,
    "letterSpacing": -0.4
  },
  "bodyLg": {
    "fontFamily": "Inter Tight",
    "fontSize": 18,
    "fontWeight": "400",
    "lineHeight": 25,
    "letterSpacing": -0.2
  },
  "body": {
    "fontFamily": "Inter Tight",
    "fontSize": 16,
    "fontWeight": "400",
    "lineHeight": 22,
    "letterSpacing": -0.1
  },
  "bodyStrong": {
    "fontFamily": "Inter Tight",
    "fontSize": 16,
    "fontWeight": "600",
    "lineHeight": 22,
    "letterSpacing": -0.1
  },
  "bodySm": {
    "fontFamily": "Inter Tight",
    "fontSize": 14,
    "fontWeight": "400",
    "lineHeight": 20,
    "letterSpacing": 0
  },
  "labelStrong": {
    "fontFamily": "Inter Tight",
    "fontSize": 14,
    "fontWeight": "600",
    "lineHeight": 18,
    "letterSpacing": -0.1
  },
  "caption": {
    "fontFamily": "Inter Tight",
    "fontSize": 12,
    "fontWeight": "400",
    "lineHeight": 16,
    "letterSpacing": 0
  },
  "label": {
    "fontFamily": "Inter Tight",
    "fontSize": 11,
    "fontWeight": "600",
    "lineHeight": 14,
    "letterSpacing": 1.6
  },
  "priceDisplay": {
    "fontFamily": "Inter Tight",
    "fontSize": 36,
    "fontWeight": "700",
    "lineHeight": 40,
    "letterSpacing": -0.8,
    "fontVariant": [
      "tabular-nums"
    ]
  },
  "price": {
    "fontFamily": "Inter Tight",
    "fontSize": 24,
    "fontWeight": "700",
    "lineHeight": 28,
    "letterSpacing": -0.4,
    "fontVariant": [
      "tabular-nums"
    ]
  },
  "priceSm": {
    "fontFamily": "Inter Tight",
    "fontSize": 18,
    "fontWeight": "700",
    "lineHeight": 22,
    "letterSpacing": -0.2,
    "fontVariant": [
      "tabular-nums"
    ]
  },
  "button": {
    "fontFamily": "Inter Tight",
    "fontSize": 17,
    "fontWeight": "600",
    "lineHeight": 22,
    "letterSpacing": -0.2
  },
  "tab": {
    "fontFamily": "Inter Tight",
    "fontSize": 12,
    "fontWeight": "500",
    "lineHeight": 16,
    "letterSpacing": 0
  },
  "tabActive": {
    "fontFamily": "Inter Tight",
    "fontSize": 12,
    "fontWeight": "700",
    "lineHeight": 16,
    "letterSpacing": 0
  },
  "wordmark": {
    "fontFamily": "Inter Tight",
    "fontSize": 17,
    "fontWeight": "700",
    "lineHeight": 22,
    "letterSpacing": -0.4
  },
  "pin": {
    "fontFamily": "Inter Tight",
    "fontSize": 13,
    "fontWeight": "700",
    "lineHeight": 15,
    "letterSpacing": -0.1
  },
  "pinDetail": {
    "fontFamily": "Inter Tight",
    "fontSize": 13,
    "fontWeight": "400",
    "lineHeight": 15,
    "letterSpacing": 0
  }
},
  radius: {
  "xs": 8,
  "sm": 12,
  "md": 16,
  "lg": 20,
  "xl": 24,
  "pill": 999
},
  space: {
  "xxs": 4,
  "xs": 8,
  "sm": 12,
  "md": 16,
  "gutter": 20,
  "lg": 24,
  "xl": 32,
  "xxl": 40,
  "xxxl": 48
},
  motion: {
  "press": 120,
  "release": 160,
  "fade": 200,
  "panel": 300,
  "fill": 400,
  "shimmer": 1400
},
  elevation: {
  "card": {
    "boxShadow": "0px 4px 16px 0px rgba(30, 41, 59, 0.08)"
  },
  "sheet": {
    "boxShadow": "0px 10px 30px 0px rgba(30, 41, 59, 0.08)"
  },
  "float": {
    "boxShadow": "0px 6px 20px 0px rgba(30, 41, 59, 0.12)"
  }
},
} as const;
export type ColorToken = keyof typeof tokens.colors;
export type TypeToken = keyof typeof tokens.type;
