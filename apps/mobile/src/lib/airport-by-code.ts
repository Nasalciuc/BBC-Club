import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { fetchAirports } from "./api";

/** Airports already found this session: a code names the same airport all session long, so Profile, Explore and a
 *  request's title ask once. Only airports found are kept — a search that failed is asked again next time. */
const found = new Map<string, AirportVM>();

/** An airport by its code: the first answer of the search that is that airport — null for a code the catalog does not
 *  know, or when the search fails. */
export async function airportByCode(code: string): Promise<AirportVM | null> {
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const known = found.get(code);
  if (known) return known;
  const result = await fetchAirports(code);
  const airport = result.ok ? (result.data.find((a) => a.code === code) ?? null) : null;
  if (airport) found.set(code, airport);
  return airport;
}
