/**
 * Where it is night on Earth right now (Figma 07 · Additions, A6 · DAY AND NIGHT: "the side of the Earth where it is
 * night is shaded from the real time, updated every minute"). Low-precision solar position (Meeus, chapter 25): the
 * declination is within 0.01° and the hour angle within about a quarter of a degree — a terminator a few kilometres
 * off, invisible at the globe's scale. Pure: a date in, GeoJSON out, nothing read from the device.
 */
import type { Feature, Polygon } from "geojson";

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

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
