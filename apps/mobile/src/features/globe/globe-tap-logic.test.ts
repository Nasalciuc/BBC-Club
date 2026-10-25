/**
 * ADR-IMPL-068: a tap anywhere on the globe snaps to the nearest city the club sells, within 600 km — the pre-registered
 * check '3.3 globe': 20 scripted taps near the site's cities open the right city; 10 over open sea get the calm answer.
 * The taps are made up: each of the 20 stands 120 km from its city on the bearing away from the city's nearest
 * neighbour; the 10 are in the middle of the oceans.
 */
import { describe, expect, it } from "bun:test";
import type { GlobeTap } from "@bbc/ui";

import {
  DISTANCE_SHOWN_PT,
  TAP_REACH_KM,
  answerTap,
  greatCircleKm,
  nearestBookable,
  nearestLine,
  roundKm,
} from "./globe-tap-logic";
import { SITE_CITY_PLACES } from "./site-cities.fixture";

const RAD = Math.PI / 180;

/** The point `km` from `from` on `bearing` (degrees from north), on the sphere greatCircleKm measures. */
function destination(from: { lat: number; lng: number }, bearing: number, km: number) {
  const d = km / 6371;
  const b = bearing * RAD;
  const lat1 = from.lat * RAD;
  const lng1 = from.lng * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / RAD, lng: ((((lng2 / RAD + 540) % 360) + 360) % 360) - 180 };
}

/**
 * A tap at `at`, the finger at the centre of a view drawn `ptPerKm` points to the kilometre near it (a local flat
 * projection: enough to tell 22 pt from 40).
 */
function tapAt(at: { lat: number; lng: number }, ptPerKm = 1 / 37.9): GlobeTap {
  const x = 196;
  const y = 300;
  return {
    ...at,
    x,
    y,
    project: (p) => ({
      x: x + (p.lng - at.lng) * Math.cos(at.lat * RAD) * 111.32 * ptPerKm,
      y: y - (p.lat - at.lat) * 110.57 * ptPerKm,
    }),
  };
}

/** A member at New York, made up for the scripted taps: far from every one of them. */
const HOME_NYC = { code: "JFK", lat: 40.6413, lng: -73.7781 };

const TAPS_20: { expect: string; tap: { lat: number; lng: number } }[] = [
  { expect: "CDG", tap: { lat: 48.0959, lng: 1.685 } }, // Paris
  { expect: "FCO", tap: { lat: 42.342, lng: 10.9913 } }, // Rome
  { expect: "ATH", tap: { lat: 38.3662, lng: 22.6857 } }, // Athens
  { expect: "IST", tap: { lat: 40.3325, lng: 29.4269 } }, // Istanbul
  { expect: "DXB", tap: { lat: 26.0847, lng: 56.1296 } }, // Dubai
  { expect: "DEL", tap: { lat: 27.6973, lng: 77.8369 } }, // New Delhi
  { expect: "BKK", tap: { lat: 14.2057, lng: 99.7753 } }, // Bangkok
  { expect: "SIN", tap: { lat: 0.7866, lng: 104.9145 } }, // Singapore
  { expect: "HND", tap: { lat: 35.8217, lng: 141.0727 } }, // Tokyo
  { expect: "SYD", tap: { lat: -33.2812, lng: 152.1977 } }, // Sydney
  { expect: "AKL", tap: { lat: -35.9651, lng: 175.1124 } }, // Auckland
  { expect: "GRU", tap: { lat: -23.6369, lng: -47.6255 } }, // São Paulo
  { expect: "EZE", tap: { lat: -34.9007, lng: -57.2241 } }, // Buenos Aires
  { expect: "LIM", tap: { lat: -10.9753, lng: -77.3827 } }, // Lima
  { expect: "CPT", tap: { lat: -34.6734, lng: 17.6091 } }, // Cape Town
  { expect: "NBO", tap: { lat: -0.2422, lng: 36.8541 } }, // Nairobi
  { expect: "CAI", tap: { lat: 29.5724, lng: 32.4745 } }, // Cairo
  { expect: "MAD", tap: { lat: 40.8898, lng: -4.8961 } }, // Madrid
  { expect: "LIS", tap: { lat: 37.7122, lng: -9.3231 } }, // Lisbon
  { expect: "VIE", tap: { lat: 48.4621, lng: 15.0364 } }, // Vienna
];

const OCEAN_10: { name: string; lat: number; lng: number }[] = [
  { name: "North Pacific", lat: 30, lng: -150 },
  { name: "Central Pacific", lat: 0, lng: -130 },
  { name: "South Pacific", lat: -40, lng: -120 },
  { name: "North Atlantic", lat: 45, lng: -35 },
  { name: "Central Atlantic", lat: 10, lng: -35 },
  { name: "South Atlantic", lat: -35, lng: -15 },
  { name: "Indian Ocean, south", lat: -35, lng: 80 },
  { name: "Indian Ocean, central", lat: -10, lng: 75 },
  { name: "Southern Ocean", lat: -58, lng: 20 },
  { name: "Tasman Sea", lat: -45, lng: -170 },
];

const nearestKm = (at: { lat: number; lng: number }) => Math.min(...SITE_CITY_PLACES.map((p) => greatCircleKm(at, p)));

describe("the scripted taps (3.3 globe)", () => {
  it("the fixture is the site's 153 placed cities, one per airport", () => {
    expect(SITE_CITY_PLACES).toHaveLength(153);
    expect(new Set(SITE_CITY_PLACES.map((p) => p.code)).size).toBe(153);
  });

  it("20 taps near the site's cities open the right city", () => {
    const got = TAPS_20.map(({ tap }) => answerTap(tapAt(tap), SITE_CITY_PLACES, HOME_NYC));
    expect(got.map((a) => (a?.kind === "place" ? a.place.code : a?.kind))).toEqual(TAPS_20.map((t) => t.expect));
    for (const [i, a] of got.entries()) {
      // Each 120 km from its city (the made-up offset), within a kilometre.
      expect(a?.kind === "place" && Math.abs(a.km - 120) < 1, TAPS_20[i]!.expect).toBe(true);
      // At rest 120 km is about 3 pt: the city is where the finger fell, no distance line.
      expect(a?.kind === "place" && a.showDistance).toBe(false);
    }
  });

  it("10 taps over open sea get the calm answer — the nearest city 1,399 to 5,288 km away", () => {
    for (const sea of OCEAN_10) {
      expect({ sea: sea.name, answer: answerTap(tapAt(sea), SITE_CITY_PLACES, HOME_NYC) }).toEqual({
        sea: sea.name,
        answer: { kind: "none" },
      });
    }
    const gaps = OCEAN_10.map(nearestKm);
    expect(Math.round(Math.min(...gaps))).toBe(1399);
    expect(Math.round(Math.max(...gaps))).toBe(5288);
  });
});

describe("nearestBookable — 600 km by great circle", () => {
  it("599 km off Cape Town is Cape Town; 601 km is nothing", () => {
    // South-west, over the South Atlantic: no other city of the site within 650 km of either point.
    const capeTown = SITE_CITY_PLACES.find((p) => p.code === "CPT")!;
    const in599 = destination(capeTown, 225, 599);
    const out601 = destination(capeTown, 225, 601);
    expect(nearestKm(in599)).toBeCloseTo(599, 0);
    expect(nearestBookable(in599, SITE_CITY_PLACES, null)).toMatchObject({ kind: "place", place: { code: "CPT" } });
    expect(nearestBookable(out601, SITE_CITY_PLACES, null)).toEqual({ kind: "none" });
    expect(TAP_REACH_KM).toBe(600);
  });

  it("a tie goes to the code", () => {
    const a = { code: "BBB", lat: 0, lng: 1 };
    const b = { code: "AAA", lat: 0, lng: -1 };
    expect(nearestBookable({ lat: 0, lng: 0 }, [a, b], null)).toMatchObject({ place: { code: "AAA" } });
    expect(nearestBookable({ lat: 0, lng: 0 }, [b, a], null)).toMatchObject({ place: { code: "AAA" } });
  });

  it("home, and home's metro the list leaves out, give the home answer", () => {
    const lhr = SITE_CITY_PLACES.find((p) => p.code === "LHR")!;
    // The list a member at Heathrow gets: without London (the server leaves home and its metro out).
    const fromLondon = SITE_CITY_PLACES.filter((p) => p.code !== "LHR");
    const home = { code: "LHR", lat: lhr.lat, lng: lhr.lng };
    // Central London, and Gatwick's side of it: home — never Birmingham, the next city, 140 km away.
    expect(answerTap(tapAt({ lat: 51.5074, lng: -0.1278 }), fromLondon, home)).toEqual({ kind: "home" });
    expect(answerTap(tapAt({ lat: 51.1537, lng: -0.1821 }), fromLondon, home)).toEqual({ kind: "home" });
    // Birmingham itself is Birmingham.
    expect(answerTap(tapAt({ lat: 52.4862, lng: -1.8904 }), fromLondon, home)).toMatchObject({
      kind: "place",
      place: { code: "BHX" },
    });
    // New York's member taps Newark (its metro, left out of the list): home.
    const newark = { lat: 40.7357, lng: -74.1724 };
    expect(nearestBookable(newark, SITE_CITY_PLACES, HOME_NYC)).toMatchObject({ kind: "home" });
  });

  it("no list, or an empty one, answers nothing: a tap off the pins does what it did before", () => {
    const paris = tapAt({ lat: 48.86, lng: 2.35 });
    expect(answerTap(paris, undefined, HOME_NYC)).toBeNull();
    expect(answerTap(paris, [], HOME_NYC)).toBeNull();
  });
});

describe("the distance line", () => {
  const rome = SITE_CITY_PLACES.find((p) => p.code === "FCO")!;
  const at = destination(rome, 200, 300);

  it("shown once the city stands more than 22 pt from the finger on screen — zoomed in — never at rest", () => {
    // At rest (37.9 km a point at the centre), 300 km is 8 pt: under the finger.
    const rest = answerTap(tapAt(at), SITE_CITY_PLACES, null);
    expect(rest).toMatchObject({ kind: "place", place: { code: "FCO" }, showDistance: false });
    // At 3× (12.6 km a point), 24 pt: the line says how far.
    const close = answerTap(tapAt(at, 1 / 12.6), SITE_CITY_PLACES, null);
    expect(close).toMatchObject({ kind: "place", showDistance: true });
    expect(DISTANCE_SHOWN_PT).toBe(22);
    // Out of sight (the far side) is far: shown.
    const hidden = answerTap({ ...tapAt(at), project: () => null }, SITE_CITY_PLACES, null);
    expect(hidden).toMatchObject({ kind: "place", showDistance: true });
  });

  it("reads `Nearest: Rome · 300 km`, to the nearest 10 km", () => {
    expect(nearestLine("Rome", 304.9)).toBe("Nearest: Rome · 300 km");
    expect(nearestLine("Rome", 175)).toBe("Nearest: Rome · 180 km");
    expect(roundKm(3)).toBe(10);
  });
});
