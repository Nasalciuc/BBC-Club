/**
 * Where a tap on Explore's globe fell (ADR-IMPL-083) — pure, so it runs under `bun test`: the town that names the spot
 * and the airports near it. The repository reads the towns of a latitude band; the airports come from the airports held
 * in memory (`airports-reference.ts`).
 */
import type { TownCandidate } from "../infrastructure/localities.repo";
import { distanceKm } from "../pricing/estimate";

/** GeoNames keeps places of 5,000 people or more in the file (seeds/NOTICE.md): the smallest weighs nothing extra. */
const SMALLEST_TOWN = 5_000;

/**
 * How near a town counts as being: its distance, shortened by its size — divided by 1 + log10(population / 5,000) —
 * so a tap on a city's own streets is named for the city, not for a suburb whose centre happens to be nearer (a tap
 * 6 km from Manhattan's centre and 3 km from Hoboken's is New York), while a tap on the suburb itself is the suburb's.
 */
export function townScore(t: Pick<TownCandidate, "population" | "km">): number {
  return t.km / (1 + Math.log10(Math.max(1, t.population / SMALLEST_TOWN)));
}

/** The town that names the tap: the best score within `reachKm`; ties to the larger town, then the name. */
export function namingTown<T extends TownCandidate>(candidates: readonly T[], reachKm: number): T | null {
  let best: { town: T; score: number } | null = null;
  for (const town of candidates) {
    if (!Number.isFinite(town.km) || town.km > reachKm) continue;
    const score = townScore(town);
    if (
      !best ||
      score < best.score ||
      (score === best.score &&
        (town.population > best.town.population ||
          (town.population === best.town.population && town.name.localeCompare(best.town.name) < 0)))
    ) {
      best = { town, score };
    }
  }
  return best?.town ?? null;
}

type Placed = { code: string; lat: number | string; lng: number | string };

/** The airports within `reachKm` of `at`, nearest first, ties to the code; at most `limit`. */
export function nearestAirports<R extends Placed>(
  rows: readonly R[],
  at: { lat: number; lng: number },
  limit: number,
  reachKm: number,
): { row: R; km: number }[] {
  const near: { row: R; km: number }[] = [];
  for (const row of rows) {
    const km = distanceKm(at, { lat: Number(row.lat), lng: Number(row.lng) });
    if (Number.isFinite(km) && km <= reachKm) near.push({ row, km });
  }
  near.sort((a, b) => a.km - b.km || a.row.code.localeCompare(b.row.code));
  return near.slice(0, limit);
}

/**
 * The point asked about, or null when it is not one: `lat` and `lng` as decimal degrees, `lat` within ±90 and `lng`
 * within ±540 (a globe turned past the antimeridian), which is brought into −180…180.
 */
export function parsePoint(lat: string | undefined, lng: string | undefined): { lat: number; lng: number } | null {
  const decimal = /^-?\d{1,3}(\.\d{1,8})?$/;
  if (!lat || !lng || !decimal.test(lat) || !decimal.test(lng)) return null;
  const y = Number(lat);
  const x = Number(lng);
  if (Math.abs(y) > 90 || Math.abs(x) > 540) return null;
  return { lat: y, lng: x >= -180 && x < 180 ? x : ((((x + 180) % 360) + 360) % 360) - 180 };
}
