import type { Executor } from "@bbc/db";
import { asc, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { airports, sitePlaces, siteRoutes } from "@bbc/db/schema/catalog";

import type { BookablePlace } from "../api";
import type { MappingAirport, SitePlace, SiteRoute } from "../application/site-places";

/** ADR-IMPL-045. The site's destinations as the last night's read left them. */
export const siteRepo = {
  async count(exec: Executor): Promise<number> {
    const [row] = await exec.select({ n: sql<number>`count(*)::int`.mapWith(Number) }).from(sitePlaces);
    return row?.n ?? 0;
  },

  /** Every airport, with what the names are matched against. */
  async mappingAirports(exec: Executor): Promise<MappingAirport[]> {
    return exec
      .select({
        code: airports.code,
        city: airports.city,
        country: airports.country,
        countryCode: airports.countryCode,
        searchTerms: airports.searchTerms,
        popularity: airports.popularity,
      })
      .from(airports);
  },

  /**
   * The new snapshot in place of the old, inside the caller's transaction. `keep`: cities whose page did not answer
   * tonight — what the last read had for them stays. A city's routes go with it (the foreign key cascades).
   */
  async replace(
    exec: Executor,
    plan: { places: readonly SitePlace[]; routes: readonly SiteRoute[] },
    keep: readonly number[],
  ): Promise<void> {
    await exec.delete(sitePlaces).where(keep.length > 0 ? notInArray(sitePlaces.cmsId, [...keep]) : undefined);
    const now = sql`now()`;
    for (let i = 0; i < plan.places.length; i += 500) {
      await exec
        .insert(sitePlaces)
        .values(plan.places.slice(i, i + 500).map((p) => ({ ...p, syncedAt: now })))
        .onConflictDoNothing({ target: sitePlaces.cmsId });
    }
    for (let i = 0; i < plan.routes.length; i += 500) {
      await exec
        .insert(siteRoutes)
        .values(plan.routes.slice(i, i + 500).map((r) => ({ ...r, syncedAt: now })))
        .onConflictDoNothing({ target: [siteRoutes.routeFrom, siteRoutes.cmsId] });
    }
  },

  /** Cities whose photo is their own, with every airport it goes on — by the site's id, so an airport two cities name
   *  always takes the same city's photo. */
  async withImage(exec: Executor): Promise<{ cmsId: number; airports: string[]; image: string }[]> {
    const rows = await exec
      .select({ cmsId: sitePlaces.cmsId, airports: sitePlaces.airports, image: sitePlaces.image })
      .from(sitePlaces)
      .where(isNotNull(sitePlaces.image))
      .orderBy(asc(sitePlaces.cmsId));
    return rows.flatMap((r) =>
      r.image ? [{ cmsId: r.cmsId, airports: r.airports.map((c) => c.trim()), image: r.image }] : [],
    );
  },

  /** What last night kept for these cities: their photo's path (null: none) and their airports. */
  async stored(exec: Executor, cmsIds: readonly number[]) {
    if (cmsIds.length === 0) return new Map<number, { image: string | null; airports: string[] }>();
    const rows = await exec
      .select({ cmsId: sitePlaces.cmsId, image: sitePlaces.image, airports: sitePlaces.airports })
      .from(sitePlaces)
      .where(inArray(sitePlaces.cmsId, [...cmsIds]));
    return new Map(rows.map((r) => [r.cmsId, { image: r.image, airports: r.airports.map((c) => c.trim()) }]));
  },

  /** The question the home screen asks, once a minute at most per home airport and cabin (it is cached): the site's
   *  cities listed from `home`, the ones on the site's home page first, then by their main airport's traffic. */
  pinsSelect(exec: Executor, home: string, limit: number) {
    return exec
      .select({
        cmsId: sitePlaces.cmsId,
        airports: sitePlaces.airports,
        airport: airports,
      })
      .from(siteRoutes)
      .innerJoin(sitePlaces, eq(sitePlaces.cmsId, siteRoutes.cmsId))
      .innerJoin(airports, eq(airports.code, sitePlaces.airport))
      .where(eq(siteRoutes.routeFrom, home.toUpperCase()))
      .orderBy(desc(sitePlaces.promoted), desc(airports.popularity), asc(airports.code))
      .limit(limit);
  },

  async pinsFrom(exec: Executor, home: string, limit: number) {
    const rows = await this.pinsSelect(exec, home, limit);
    return rows.map((r) => ({ ...r, airports: r.airports.map((c) => c.trim()) }));
  },

  /** ADR-IMPL-068: the airports a tap on the globe may open — every city's main airport and every US airport the site
   *  lists a price from — with their names and places, in one round trip (UNION drops an airport listed twice). */
  async bookable(exec: Executor): Promise<BookablePlace[]> {
    const columns = {
      code: airports.code,
      name: airports.name,
      city: airports.city,
      countryCode: airports.countryCode,
      lat: airports.lat,
      lng: airports.lng,
    };
    const rows = await exec
      .select(columns)
      .from(sitePlaces)
      .innerJoin(airports, eq(airports.code, sitePlaces.airport))
      .union(exec.select(columns).from(siteRoutes).innerJoin(airports, eq(airports.code, siteRoutes.routeFrom)));
    return rows.map((r) => ({
      code: r.code.trim(),
      name: r.name,
      city: r.city,
      countryCode: r.countryCode,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));
  },
};
