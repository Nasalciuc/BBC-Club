import { describe, expect, it } from "bun:test";
import { CITY_LIGHTS, FIGMA_ZOOM, ZOOM_RANGE, cityLightFeatures, solarAltitude, sunPosition } from "@bbc/ui/globe-sky";
import { tokens } from "@bbc/ui/tokens";

import { NIGHT_STYLE, cityLightsStyle, skyAt } from "./sky-style";

/** The few Mapbox expression operators these styles use, evaluated as Mapbox does, for one feature at one zoom. */
function evaluate(expr: unknown, props: Record<string, number>, zoom = FIGMA_ZOOM): number {
  if (typeof expr === "number") return expr;
  if (!Array.isArray(expr)) throw new Error(`not an expression: ${JSON.stringify(expr)}`);
  const [op, ...args] = expr as [string, ...unknown[]];
  const num = (e: unknown) => evaluate(e, props, zoom);
  switch (op) {
    case "get":
      return props[args[0] as string]!;
    case "zoom":
      return zoom;
    case "+":
      return args.reduce<number>((sum, a) => sum + num(a), 0);
    case "*":
      return args.reduce<number>((product, a) => product * num(a), 1);
    case "-":
      return num(args[0]) - num(args[1]);
    case "cos":
      return Math.cos(num(args[0]));
    case "interpolate": {
      const [kind, input, ...stops] = args as [[string, number?], unknown, ...unknown[]];
      const x = num(input);
      const pairs: [number, unknown][] = [];
      for (let i = 0; i < stops.length; i += 2) pairs.push([stops[i] as number, stops[i + 1]]);
      if (x <= pairs[0]![0]) return num(pairs[0]![1]);
      if (x >= pairs.at(-1)![0]) return num(pairs.at(-1)![1]);
      const i = pairs.findIndex(([at]) => at > x);
      const [x0, y0] = pairs[i - 1]!;
      const [x1, y1] = pairs[i]!;
      const base = kind[0] === "exponential" ? (kind[1] ?? 1) : 1;
      const t = base === 1 ? (x - x0) / (x1 - x0) : (base ** (x - x0) - 1) / (base ** (x1 - x0) - 1);
      return num(y0) + (num(y1) - num(y0)) * t;
    }
    default:
      throw new Error(`operator not modelled: ${op}`);
  }
}

const lights = cityLightFeatures().features;
const city = (lng: number, lat: number) =>
  lights.find(
    ({
      geometry: {
        coordinates: [x = 0, y = 0],
      },
    }) => Math.abs(x - lng) < 0.3 && Math.abs(y - lat) < 0.3,
  )!;

describe("cityLightsStyle", () => {
  const evening = new Date("2026-10-13T19:30:00Z"); // night over Europe, day over the Americas
  const style = cityLightsStyle(sunPosition(evening));
  const opacity = (lng: number, lat: number) => evaluate(style.circleOpacity, city(lng, lat).properties);

  it("lights a city only where the sun is down, at its own weight past civil dusk", () => {
    const london = city(-0.12, 51.5);
    expect(solarAltitude(-0.12, 51.5, evening)).toBeLessThan(CITY_LIGHTS.fullBelowDeg);
    expect(opacity(-0.12, 51.5)).toBeCloseTo(london.properties.w, 3);
    expect(solarAltitude(-74.0, 40.72, evening)).toBeGreaterThan(0);
    expect(opacity(-74.0, 40.72)).toBe(0); // New York in daylight
  });

  it("follows the sun the map is given, over thousands of cities", () => {
    for (const date of ["2026-10-13T11:52:00Z", "2026-06-21T03:00:00Z", "2026-12-21T18:00:00Z"].map(
      (s) => new Date(s),
    )) {
      const at = cityLightsStyle(sunPosition(date));
      for (const f of lights.slice(0, 400)) {
        const [lng = 0, lat = 0] = f.geometry.coordinates;
        const alt = solarAltitude(lng, lat, date);
        const o = evaluate(at.circleOpacity, f.properties);
        if (alt > 0.2) expect(o).toBe(0);
        if (alt < CITY_LIGHTS.fullBelowDeg - 0.2) expect(o).toBeCloseTo(f.properties.w, 2);
        if (alt < 0 && alt > CITY_LIGHTS.fullBelowDeg) expect(o).toBeLessThan(f.properties.w + 1e-9);
      }
    }
  });

  it("glows in its own colour, its size doubling at the closest zoom", () => {
    expect(style.circleColor).toBe(tokens.colors.surfaceCard);
    expect(style.circleBlur).toBe(1);
    const tokyo = lights[0]!.properties;
    expect(evaluate(style.circleRadius, tokyo, FIGMA_ZOOM)).toBeCloseTo(tokyo.r, 6);
    expect(evaluate(style.circleRadius, tokyo, ZOOM_RANGE.max)).toBeCloseTo(tokyo.r * 2, 6);
    expect(evaluate(style.circleRadius, tokyo, ZOOM_RANGE.min)).toBeCloseTo(tokyo.r, 6);
  });
});

describe("skyAt", () => {
  it("gives the night's caps and the lights' style for one moment", () => {
    const date = new Date("2026-10-13T11:52:00Z");
    const sky = skyAt(date);
    expect(sky.night.features.length).toBeGreaterThan(10);
    expect(sky.lights).toEqual(cityLightsStyle(sunPosition(date)));
    expect(NIGHT_STYLE.fillColor).toBe(tokens.colors.globeNight);
    expect(NIGHT_STYLE.fillOpacity).toEqual(["get", "opacity"]);
  });
});
