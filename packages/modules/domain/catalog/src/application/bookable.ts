/**
 * The cities a tap anywhere on Explore's globe may open (ADR-IMPL-068, decision D8) — pure, so it runs under `bun test`.
 *
 * Bookable from home H: the site's cities (each by its main airport), the US airports the site lists a price from, and
 * the arrivals of the fares and offers Home holds for the member — minus H and every airport of its metro. A formula
 * price alone never makes a city bookable: from New York the formula prices nearly every airport there is, the places
 * the club cannot sell among them; it only prices a city already in the set, through that city's search.
 */
import type { BookablePlace } from "../api";
import { SAME_METRO_KM, distanceKm } from "../pricing/estimate";

const IATA = /^[A-Z]{3}$/;

const placed = (p: BookablePlace) =>
  IATA.test(p.code) &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

/**
 * One entry per airport (the first seen wins: the site's, then the caller's), without `home` and — when its coordinates
 * are known — without any airport under SAME_METRO_KM from it (JFK's member never snaps to Newark: a tap there is the
 * home answer). By code, so the list, and Home's ETag over it, are the same for the same data.
 */
export function bookableFrom(
  site: readonly BookablePlace[],
  home: { code: string; lat?: number; lng?: number },
  also: readonly BookablePlace[] = [],
): BookablePlace[] {
  const homeCode = home.code.trim().toUpperCase();
  const at =
    home.lat !== undefined && home.lng !== undefined && Number.isFinite(home.lat) && Number.isFinite(home.lng)
      ? { lat: home.lat, lng: home.lng }
      : null;
  const byCode = new Map<string, BookablePlace>();
  for (const p of [...site, ...also]) {
    const code = p.code.trim().toUpperCase();
    if (byCode.has(code)) continue;
    const place = { ...p, code };
    if (!placed(place) || code === homeCode) continue;
    if (at && distanceKm(at, place) < SAME_METRO_KM) continue;
    byCode.set(code, place);
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}
