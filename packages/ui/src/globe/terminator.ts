/**
 * Where it is night on Earth right now (Figma 07 · Additions, A6 · DAY AND NIGHT: "the side of the Earth where it is
 * night is shaded from the real time, updated every minute"). Low-precision solar position (Meeus, chapter 25): the
 * declination is within 0.01° and the hour angle within about a quarter of a degree — a terminator a few kilometres
 * off, invisible at the globe's scale. Pure: a date in, GeoJSON out, nothing read from the device.
 */
import type { Feature, FeatureCollection, Polygon } from "geojson";

const DEG = Math.PI / 180;

export type SunPosition = {
  /** Declination, degrees (+north). */
  declination: number;
  /** Longitude where the sun is overhead, degrees (−180, 180]. */
  subsolarLng: number;
};

/** Days since J2000.0 (2000-01-01 12:00 TT, taken as UTC here — the 69 s of ΔT move the sun by 0.3°). */
function daysSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
}

export function sunPosition(date: Date): SunPosition {
  const d = daysSinceJ2000(date);
  const meanLongitude = (280.46 + 0.9856474 * d) % 360;
  const meanAnomaly = (357.528 + 0.9856003 * d) * DEG;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;
  const obliquity = (23.439 - 0.0000004 * d) * DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  // Greenwich mean sidereal time, degrees; the sun's Greenwich hour angle is GMST − RA.
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const hourAngle = gmst - rightAscension / DEG;
  return { declination: declination / DEG, subsolarLng: normalizeLng(-hourAngle) };
}

export function normalizeLng(lng: number): number {
  const r = ((((lng + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** The sun's altitude above the horizon at a point, degrees. Negative is night. */
export function solarAltitude(lng: number, lat: number, date: Date): number {
  const sun = sunPosition(date);
  const h = (lng - sun.subsolarLng) * DEG;
  const sinAlt =
    Math.sin(lat * DEG) * Math.sin(sun.declination * DEG) +
    Math.cos(lat * DEG) * Math.cos(sun.declination * DEG) * Math.cos(h);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
}

/**
 * The night hemisphere as one planar polygon Mapbox can fill: the terminator's latitude at each longitude
 * (sin φ sin δ + cos φ cos δ cos H = 0 → φ = atan(−cos H / tan δ)), closed over the pole that is in darkness. The
 * curve is sampled every `stepDeg` degrees of longitude.
 */
export function nightPolygon(date: Date, stepDeg = 2): Feature<Polygon> {
  const sun = sunPosition(date);
  const tanDecl = Math.tan(sun.declination * DEG);
  const ring: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += stepDeg) {
    const h = (lng - sun.subsolarLng) * DEG;
    // δ = 0 exactly: the terminator is a pair of meridians; the limit sends the latitude to the pole on the right side.
    const lat = tanDecl === 0 ? (Math.cos(h) >= 0 ? -90 : 90) : Math.atan(-Math.cos(h) / tanDecl) / DEG;
    ring.push([lng, round(lat)]);
  }
  // Northern winter (δ < 0): the North Pole is dark — close the ring over +90; otherwise over −90.
  const darkPole = sun.declination < 0 ? 90 : -90;
  ring.push([180, darkPole], [-180, darkPole], ring[0]!);
  return { type: "Feature", properties: { kind: "night" }, geometry: { type: "Polygon", coordinates: [ring] } };
}

/**
 * Twilight (13 Oct 2026, ADR-IMPL-035): the night side as 30 bands of the sun's altitude, half a degree each, from the
 * horizon down to −15°, and the deep night past it. The bands never overlap, so every point of the night is shaded once,
 * at its band's darkness: `depth · (1 − (1 − t)^ease)`, t being how far into twilight the band's middle lies — steep
 * after sunset, gentle later, as the sky darkens — and `depth` past −15°. Neighbouring bands differ by under 5 %: too
 * little to read as a line, and one layer of shade wherever it is night.
 */
export const TWILIGHT = { stepDeg: 0.5, bands: 30, depth: 0.78, ease: 1.6 } as const;

/** A band of the night: where the sun's altitude lies between `to` and `from` (degrees; −90 for the deep night). */
export type TwilightProps = { from: number; to: number; opacity: number };

export function twilightBands(date: Date): FeatureCollection<Polygon, TwilightProps> {
  const sun = sunPosition(date);
  const { stepDeg, bands, depth, ease } = TWILIGHT;
  const deepest = -bands * stepDeg;
  // One window of longitudes for every edge, centred on the point opposite the sun: the circles and the curves round a
  // pole share one plane there, so a band's hole always lies inside its outer edge, even astride the antimeridian.
  const centre = normalizeLng(sun.subsolarLng + 180);
  const edges = Array.from({ length: bands + 1 }, (_, k) => edgeAt(sun, 0 - k * stepDeg, centre));
  const features: Feature<Polygon, TwilightProps>[] = edges.map((outer, k) => {
    const inner = edges[k + 1] ?? null;
    const from = 0 - k * stepDeg;
    const to = inner ? from - stepDeg : -90;
    const darkness = inner ? depth * (1 - (1 - (from + to) / 2 / deepest) ** ease) : depth;
    return {
      type: "Feature",
      properties: { from, to, opacity: Math.round(darkness * 1e4) / 1e4 },
      geometry: bandBetween(outer, inner),
    };
  });
  return { type: "FeatureCollection", features };
}

/** Where the sun stands at `altitude`: round a pole, the edge from the window's west side to its east side; else a closed
 *  circle about the point opposite the sun. */
type Edge = { pole: 90 | -90 | null; points: [number, number][] };

/**
 * The edge is a circle of radius 90° + altitude about the point opposite the sun, walked by bearing — evenly along its
 * length, so a terminator that runs north–south at an equinox is drawn as finely as one that runs east–west. A circle
 * that holds neither pole stays within half a world of its centre: closed as it is. One round a pole turns once through
 * every longitude: cut where it crosses the window's side (the noon meridian) and run west to east.
 */
function edgeAt(sun: SunPosition, altitude: number, centre: number, stepDeg = 3): Edge {
  const phi = -sun.declination * DEG;
  const rho = (90 + altitude) * DEG;
  const walk: { turn: number; lat: number }[] = [];
  for (let bearing = 0; bearing < 360; bearing += stepDeg) {
    const b = bearing * DEG;
    const lat = Math.asin(Math.sin(phi) * Math.cos(rho) + Math.cos(phi) * Math.sin(rho) * Math.cos(b));
    const turn = Math.atan2(Math.sin(b) * Math.sin(rho) * Math.cos(phi), Math.cos(rho) - Math.sin(phi) * Math.sin(lat));
    walk.push({ turn: turn / DEG, lat: lat / DEG });
  }
  const cut = walk.findIndex((p, i) => Math.abs(walk[(i + 1) % walk.length]!.turn - p.turn) > 180);
  if (90 - Math.abs(phi / DEG) >= 90 + altitude || cut < 0) {
    const points = walk.map((p): [number, number] => [round(centre + p.turn), round(p.lat)]);
    points.push(points[0]!);
    return { pole: null, points };
  }
  // From just past the cut round to it again: longitudes now run one way without a jump; make that way west to east.
  let run = [...walk.slice(cut + 1), ...walk.slice(0, cut + 1)];
  if (run[0]!.turn > run.at(-1)!.turn) run = run.reverse();
  const west = run[0]!;
  const east = run.at(-1)!;
  // Where the edge meets the noon meridian (turn ±180), between the run's two ends.
  const t = (180 - east.turn) / (west.turn + 360 - east.turn);
  const side = round(east.lat + (west.lat - east.lat) * t);
  const points: [number, number][] = [
    [round(centre - 180), side],
    ...run.map((p): [number, number] => [round(centre + p.turn), round(p.lat)]),
    [round(centre + 180), side],
  ];
  return { pole: phi > 0 ? 90 : -90, points };
}

/** The night between two edges (the inner one nearer the deep night), or everything past the last. */
function bandBetween(outer: Edge, inner: Edge | null): Polygon {
  if (outer.pole === null) {
    return { type: "Polygon", coordinates: inner ? withHole(outer.points, inner.points) : [outer.points] };
  }
  const first = outer.points[0]!;
  const last = outer.points.at(-1)!;
  const overPole: [number, number][] = [...outer.points, [last[0], outer.pole], [first[0], outer.pole], first];
  if (inner === null) return { type: "Polygon", coordinates: [overPole] };
  // Both edges round the same pole: out along the outer edge, back along the inner one.
  if (inner.pole === outer.pole)
    return { type: "Polygon", coordinates: [[...outer.points, ...[...inner.points].reverse(), first]] };
  return { type: "Polygon", coordinates: withHole(overPole, inner.points) };
}

/** Mapbox tells a hole from a second polygon by its winding: a hole always turns the other way from its outer ring. */
function withHole(outer: [number, number][], hole: [number, number][]): [number, number][][] {
  return signedArea(outer) * signedArea(hole) < 0 ? [outer, hole] : [outer, [...hole].reverse()];
}

function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return sum / 2;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
