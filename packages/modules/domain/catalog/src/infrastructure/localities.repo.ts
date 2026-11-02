import type { Executor } from "@bbc/db";
import { and, asc, between, sql } from "drizzle-orm";
import { localities } from "@bbc/db/schema/catalog";

/** A town near a tap on the globe, as the nearest-place question reads it. */
export type TownCandidate = {
  name: string;
  countryCode: string;
  population: number;
  /** From the tap, by great circle. */
  km: number;
};

/** How many degrees of latitude `km` spans (the band the towns are read from). */
export function latitudeBand(km: number): number {
  return km / 111.19;
}

/** How many towns a tap weighs at most: the nearest of its band, by great circle. */
const CANDIDATES = 40;

export const localitiesRepo = {
  /**
   * The towns within `reachKm` of `at` (ADR-IMPL-083), nearest first, at most 40: one read of the latitude band
   * (`localities_lat`), the distance computed for the band's rows only. The point is a parameter, never logged.
   */
  async near(exec: Executor, at: { lat: number; lng: number }, reachKm: number): Promise<TownCandidate[]> {
    const band = latitudeBand(reachKm);
    const km = sql<number>`2 * 6371 * asin(least(1, sqrt(
      power(sin(radians(${localities.lat} - ${at.lat}::float8) / 2), 2)
      + cos(radians(${at.lat}::float8)) * cos(radians(${localities.lat}))
        * power(sin(radians(${localities.lng} - ${at.lng}::float8) / 2), 2)
    )))`;
    const rows = await exec
      .select({
        name: localities.name,
        countryCode: localities.countryCode,
        population: localities.population,
        km,
      })
      .from(localities)
      .where(and(between(localities.lat, at.lat - band, at.lat + band), sql`${km} <= ${reachKm}::float8`))
      .orderBy(asc(km), asc(localities.name))
      .limit(CANDIDATES);
    return rows.map((r) => ({
      name: r.name,
      countryCode: r.countryCode,
      population: Number(r.population),
      km: Number(r.km),
    }));
  },
};
