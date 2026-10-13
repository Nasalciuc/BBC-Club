import { describe, expect, it } from "bun:test";

import { TWILIGHT, nightPolygon, normalizeLng, solarAltitude, sunPosition, twilightBands } from "./terminator";

/** Ray casting on the planar ring, as Mapbox fills it. */
function inside(ring: number[][], lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i]!;
    const [xj = 0, yj = 0] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe("sunPosition", () => {
  it("knows the solstices and the equinox", () => {
    expect(sunPosition(new Date("2026-06-21T08:25:00Z")).declination).toBeCloseTo(23.44, 1);
    expect(sunPosition(new Date("2026-12-21T20:50:00Z")).declination).toBeCloseTo(-23.44, 1);
    expect(Math.abs(sunPosition(new Date("2026-03-20T14:46:00Z")).declination)).toBeLessThan(0.1);
  });

  it("puts the sun over Greenwich around noon UTC and over the antimeridian at midnight", () => {
    expect(Math.abs(sunPosition(new Date("2026-10-08T11:48:00Z")).subsolarLng)).toBeLessThan(1); // EoT ≈ +12 min
    expect(Math.abs(Math.abs(sunPosition(new Date("2026-10-08T23:48:00Z")).subsolarLng) - 180)).toBeLessThan(1);
    // Equation of time: in early November the sun transits Greenwich about 16 minutes before 12:00.
    expect(sunPosition(new Date("2026-11-03T11:44:00Z")).subsolarLng).toBeCloseTo(0, 0);
  });
});

describe("solarAltitude", () => {
  it("is high at the subsolar point and deepest at its antipode", () => {
    const date = new Date("2026-06-21T12:00:00Z");
    const sun = sunPosition(date);
    expect(solarAltitude(sun.subsolarLng, sun.declination, date)).toBeCloseTo(90, 0);
    expect(solarAltitude(normalizeLng(sun.subsolarLng + 180), -sun.declination, date)).toBeCloseTo(-90, 0);
  });

  it("shows London the sun at noon and not at midnight", () => {
    expect(solarAltitude(-0.1, 51.5, new Date("2026-10-08T12:00:00Z"))).toBeGreaterThan(30);
    expect(solarAltitude(-0.1, 51.5, new Date("2026-10-08T00:00:00Z"))).toBeLessThan(-30);
  });
});

describe("nightPolygon", () => {
  const dates = [
    "2026-10-08T15:00:00Z",
    "2026-06-21T03:00:00Z",
    "2026-12-21T18:00:00Z",
    "2026-03-20T14:46:00Z",
    "2026-09-23T00:00:00Z",
  ].map((s) => new Date(s));

  it("closes over the dark pole: north in winter, south in summer", () => {
    const winter = nightPolygon(new Date("2026-12-21T12:00:00Z")).geometry.coordinates[0]!;
    const summer = nightPolygon(new Date("2026-06-21T12:00:00Z")).geometry.coordinates[0]!;
    expect(winter.some(([, lat]) => lat === 90)).toBe(true);
    expect(summer.some(([, lat]) => lat === -90)).toBe(true);
    expect(winter[0]).toEqual(winter[winter.length - 1]);
  });

  it("covers exactly the points where the sun is below the horizon, away from the line itself", () => {
    for (const date of dates) {
      const ring = nightPolygon(date).geometry.coordinates[0]!;
      let checked = 0;
      for (let lat = -80; lat <= 80; lat += 10) {
        for (let lng = -170; lng <= 170; lng += 10) {
          const alt = solarAltitude(lng, lat, date);
          if (Math.abs(alt) < 1.5) continue; // on the terminator the sampled curve may fall either way
          expect(inside(ring, lng, lat)).toBe(alt < 0);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(400);
    }
  });

  it("is small enough to send to the map every minute", () => {
    const ring = nightPolygon(new Date("2026-10-08T15:00:00Z")).geometry.coordinates[0]!;
    expect(ring.length).toBeLessThan(200);
  });
});

describe("twilightBands", () => {
  const dates = [
    "2026-10-13T11:52:00Z", // the owner's screenshot: dusk over India and China
    "2026-10-13T19:30:00Z", // night over Europe, day over the Americas
    "2026-06-21T03:00:00Z",
    "2026-12-21T18:00:00Z",
    "2026-03-20T12:00:00Z", // equinox at noon: every edge a circle, astride the antimeridian
    "2026-02-10T06:10:00Z", // the deep bands are circles, the shallow ones round the North Pole: holes in a ring
  ].map((s) => new Date(s));

  /** Even–odd over every ring, holes included, as Mapbox fills a polygon. */
  const insidePolygon = (rings: number[][][], lng: number, lat: number) =>
    rings.reduce((hit, ring) => (inside(ring, lng, lat) ? !hit : hit), false);
  /** The bands' longitudes run across a window centred opposite the sun: try the point in each world copy. */
  const covers = (rings: number[][][], lng: number, lat: number) =>
    [lng, lng - 360, lng + 360].some((x) => insidePolygon(rings, x, lat));

  it("shades each point of the night once, in the band of its sun's altitude, and leaves the day alone", () => {
    for (const date of dates) {
      const bands = twilightBands(date).features;
      let checked = 0;
      for (let lat = -85; lat <= 85; lat += 10) {
        for (let lng = -177.5; lng <= 177.5; lng += 10) {
          const alt = solarAltitude(lng, lat, date);
          // On an edge the sampled curve may fall either way.
          const nearEdge = bands.some((b) => Math.abs(alt - b.properties.from) < 0.3);
          if (nearEdge) continue;
          const hits = bands.filter((b) => covers(b.geometry.coordinates, lng, lat));
          if (alt > 0) expect(hits).toHaveLength(0);
          else {
            expect(hits).toHaveLength(1);
            expect(alt).toBeLessThan(hits[0]!.properties.from);
            expect(alt).toBeGreaterThanOrEqual(hits[0]!.properties.to);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(400);
    }
  });

  it("winds every hole against its outer ring, as Mapbox needs to see a hole", () => {
    const area = (ring: number[][]) =>
      ring.slice(0, -1).reduce((sum, [x1 = 0, y1 = 0], i) => {
        const [x2 = 0, y2 = 0] = ring[i + 1]!;
        return sum + x1 * y2 - x2 * y1;
      }, 0) / 2;
    let holes = 0;
    for (const date of dates) {
      for (const band of twilightBands(date).features) {
        const [outer, ...rest] = band.geometry.coordinates;
        for (const hole of rest) {
          expect(Math.sign(area(hole))).toBe(-Math.sign(area(outer!)));
          holes++;
        }
        for (const ring of band.geometry.coordinates) expect(ring[0]).toEqual(ring.at(-1));
      }
    }
    expect(holes).toBeGreaterThan(20);
  });

  it("darkens from the horizon to the deep night in steps too small to read as a line", () => {
    const bands = twilightBands(dates[1]!).features;
    expect(bands).toHaveLength(TWILIGHT.bands + 1);
    expect(bands[0]!.properties.from).toBe(0);
    expect(bands.at(-2)!.properties.to).toBe(-15);
    expect(bands.at(-1)!.properties).toEqual({ from: -15, to: -90, opacity: TWILIGHT.depth });
    const shades = bands.map((b) => b.properties.opacity);
    for (let i = 1; i < shades.length; i++) {
      expect(shades[i]!).toBeGreaterThanOrEqual(shades[i - 1]!);
      expect(shades[i]! - shades[i - 1]!).toBeLessThan(0.05);
    }
    expect(shades[0]!).toBeLessThan(0.05);
    // Steep after sunset, gentle in deep twilight.
    expect(shades[1]! - shades[0]!).toBeGreaterThan(shades.at(-2)! - shades.at(-3)!);
  });

  it("is small enough to send to the map every minute", () => {
    for (const date of dates) {
      const points = twilightBands(date).features.reduce(
        (n, b) => n + b.geometry.coordinates.reduce((m, ring) => m + ring.length, 0),
        0,
      );
      expect(points).toBeLessThan(8000);
    }
  });
});
