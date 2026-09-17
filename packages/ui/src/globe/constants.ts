/** Taken from isolated/bbc-club-home-design/app/globals.css, 17 Sep 2026.
 *  Prototype is frozen and never imported; these are the decisions it settled. */
export const GLOBE = {
  sphere: {
    colors: ["#25476E", "#1B3355", "#16273F", "#0F172A"] as const,
    locations: [0, 0.28, 0.55, 0.78] as const,
    center: { x: 0.42, y: 0.34 },
    shadow: { offsetX: -60, offsetY: -40, radius: 120, color: "#070B14" },
  },
  pin: {
    fare: { size: 10, halo: 0, haloColor: "transparent" },
    offer: { size: 14, halo: 5, haloColor: "rgba(248,250,252,0.22)" },
    selected: {
      size: 14,
      halo: 7,
      haloColor: "rgba(248,250,252,0.28)",
      outerHalo: 14,
      outerColor: "rgba(248,250,252,0.10)",
    },
  },
  arc: { width: 2, dash: [4, 4] as const, dashOffset: 32, durationMs: 600 },
  camera: { flyToMs: 800 },
  fallbackTimeoutMs: 3000,
} as const;
