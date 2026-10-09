import { describe, expect, it } from "bun:test";

import { nightPolygon, normalizeLng, solarAltitude, sunPosition } from "./terminator";

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
