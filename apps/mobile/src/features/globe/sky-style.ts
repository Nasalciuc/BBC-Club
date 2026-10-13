/**
 * The night on the Mapbox globe, as layer styles (ADR-IMPL-035, amended 13 Oct 2026). Pure: no map, so it runs under
 * `bun test`. Types only from @rnmapbox/maps — importing its code without the native module throws.
 */
import type { CircleLayerStyle, FillLayerStyle } from "@rnmapbox/maps";
import { CITY_LIGHTS, FIGMA_ZOOM, ZOOM_RANGE, sunPosition, twilightBands, type SunPosition } from "@bbc/ui/globe-sky";
import { tokens } from "@bbc/ui/tokens";

type Expression = Exclude<CircleLayerStyle["circleOpacity"], number | undefined>;

const DEG = Math.PI / 180;

/** The twilight bands in space's own near-black, each at the darkness `twilightBands` gave it. Side by side, never
 *  over one another: one layer of shade wherever it is night. No antialiasing — two bands share every edge, and a soft
 *  edge on each would draw the line between them. */
export const NIGHT_STYLE: FillLayerStyle = {
  fillColor: tokens.colors.globeSpace,
  fillOpacity: ["get", "opacity"],
  fillAntialias: false,
};

/**
 * City lights. Mapbox works out the sun's altitude over each city — sin a = sin φ sin δ + cos φ cos δ cos(λ − λs) — from
 * the sun's position written into the expression, so a minute's change sends a few numbers, not 3,089 points. Off at
 * the horizon, full past civil dusk, each at its city's weight; a glow (blur 1) that doubles in size at the closest zoom.
 */
export function cityLightsStyle(sun: SunPosition): CircleLayerStyle {
  const sinAltitude: Expression = [
    "+",
    ["*", ["get", "s"], Math.sin(sun.declination * DEG)],
    ["*", ["get", "c"], Math.cos(sun.declination * DEG), ["cos", ["-", ["get", "l"], sun.subsolarLng * DEG]]],
  ];
  return {
    circleColor: tokens.colors.globeCityLights,
    circleBlur: 1,
    circleRadius: [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      FIGMA_ZOOM,
      ["get", "r"],
      ZOOM_RANGE.max,
      ["*", ["get", "r"], 2],
    ],
    circleOpacity: [
      "*",
      ["get", "w"],
      [
        "interpolate",
        ["linear"],
        sinAltitude,
        Math.sin(CITY_LIGHTS.fullBelowDeg * DEG),
        1,
        Math.sin(CITY_LIGHTS.offAboveDeg * DEG),
        0,
      ],
    ],
  };
}

export type Sky = { night: ReturnType<typeof twilightBands>; lights: CircleLayerStyle };

/** Everything the night needs at one moment: recomputed on the minute, one state, so renders in between (the halos'
 *  pulse, the route drawing itself) hand Mapbox the same objects. */
export function skyAt(date: Date): Sky {
  return { night: twilightBands(date), lights: cityLightsStyle(sunPosition(date)) };
}
