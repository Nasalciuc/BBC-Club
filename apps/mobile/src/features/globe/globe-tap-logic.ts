/**
 * Tap anywhere on Explore's globe (ADR-IMPL-068, decision D8) — pure, so it runs under `bun test`.
 *
 * The finger lands on a place; the globe snaps to the nearest city the club can sell from the member's home (Home's
 * `bookable`), by great circle, within 600 km. Farther, or over open sea: a calm answer that points to the search. The
 * member's own city (home, whose metro the list leaves out): the home answer. The tapped point never leaves the phone.
 */
import type { GlobeTap } from "@bbc/ui";

/** How far from the finger a city may be and still be the one meant (D8). */
export const TAP_REACH_KM = 600;
/**
 * Under half a finger (22 of 44 pt) the city is where the finger fell, and the distance would only say so; past it the
 * line says how far the city is. Measured on screen: at rest 600 km is under 16 pt, so the line shows only zoomed in.
 */
export const DISTANCE_SHOWN_PT = 22;

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

type Spot = { code: string; lat: number; lng: number };

/** Great-circle distance in km (haversine). */
export function greatCircleKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Nearest<P> = { kind: "place"; place: P; km: number } | { kind: "home"; km: number } | { kind: "none" };

/**
 * The city nearest `at` within `reachKm`, ties to the code — or home, when home is nearer than every city (the list
 * leaves home and its metro out, so a tap on Newark from New York finds home); or none.
 */
export function nearestBookable<P extends Spot>(
  at: { lat: number; lng: number },
  places: readonly P[],
  home: Spot | null,
  reachKm: number = TAP_REACH_KM,
): Nearest<P> {
  let best: { place: P | null; code: string; km: number } | null = null;
  const candidates: { place: P | null; spot: Spot }[] = places.map((p) => ({ place: p, spot: p }));
  if (home) candidates.push({ place: null, spot: home });
  for (const c of candidates) {
    const km = greatCircleKm(at, c.spot);
    if (!Number.isFinite(km) || km > reachKm) continue;
    if (!best || km < best.km || (km === best.km && c.spot.code.localeCompare(best.code) < 0)) {
      best = { place: c.place, code: c.spot.code, km };
    }
  }
  if (!best) return { kind: "none" };
  return best.place ? { kind: "place", place: best.place, km: best.km } : { kind: "home", km: best.km };
}

export type TapAnswer<P> =
  { kind: "place"; place: P; km: number; showDistance: boolean } | { kind: "home" } | { kind: "none" };

/**
 * What a tap on the globe answers. Null without a list — an older server, the flag off, a Home that did not load, or
 * an empty one: a tap off the pins does nothing, as before. A city comes with whether to say how far it is: when it
 * stands more than DISTANCE_SHOWN_PT from the finger on screen, or out of sight.
 */
export function answerTap<P extends Spot>(
  tap: GlobeTap,
  places: readonly P[] | undefined,
  home: Spot | null,
): TapAnswer<P> | null {
  if (!places || places.length === 0) return null;
  const nearest = nearestBookable(tap, places, home);
  if (nearest.kind !== "place") return nearest.kind === "home" ? { kind: "home" } : { kind: "none" };
  const xy = tap.project(nearest.place);
  const showDistance = xy === null || Math.hypot(xy.x - tap.x, xy.y - tap.y) > DISTANCE_SHOWN_PT;
  return { kind: "place", place: nearest.place, km: nearest.km, showDistance };
}

/** The distance as the line prints it: to the nearest 10 km, at least 10. */
export function roundKm(km: number): number {
  return Math.max(10, Math.round(km / 10) * 10);
}

/** `Nearest: Rome · 180 km` (the brief's words, in kilometres). */
export function nearestLine(city: string, km: number): string {
  return `Nearest: ${city} · ${roundKm(km)} km`;
}

/** The calm answer: nothing the club sells near where the finger fell — the search is the way to a city. */
export const NOTHING_NEAR = {
  title: "No destination near there.",
  body: "Tap closer to a city, or search for one.",
  link: "Search a destination",
} as const;
