import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { fetchAirports } from "./api";

/** An airport by its code: the first answer of the search that is that airport — null for a code the catalog does not
 *  know, or when the search fails. */
export async function airportByCode(code: string): Promise<AirportVM | null> {
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const result = await fetchAirports(code);
  return result.ok ? (result.data.find((a) => a.code === code) ?? null) : null;
}
