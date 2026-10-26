import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, gt, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { airports, placePhotos, sitePlaces, siteRoutes } from "@bbc/db/schema/catalog";

import type { BookablePlace } from "../api";
import type { MappingAirport, SitePlace, SiteRoute } from "../application/site-places";
import type { PlacePhotoRow } from "./place-photos.repo";

/** D6 (ADR-IMPL-067): a route the read wrote is served for this long — the CHECK `site_routes_validity` holds it. */
export const SITE_ROUTE_VALID = sql`interval '24 hours'`;

/** A snapshot holds back a read that lists far fewer cities (site-sync.ts) only while it has more than this left of its
 *  day: with two runs a day, the run twelve hours after a good one is weighed against it, the run a day after is not —
 *  what it would keep serves nothing from then on (ADR-IMPL-067). */
const SITE_GUARD_LEFT = sql`interval '1 hour'`;

/** A route still served `marginS` seconds from now: a reader that keeps what it read for a minute asks for a minute
 *  more, so nothing it serves passes its day while kept. */
const served = (marginS = 0) =>
  marginS > 0
    ? gt(siteRoutes.validUntil, sql`now() + make_interval(secs => ${marginS})`)
    : gt(siteRoutes.validUntil, sql`now()`);

/** ADR-IMPL-045. The site's destinations as the last night's read left them. */
export const siteRepo = {
  /** The cities a night's read is weighed against: the snapshot's, each written (or kept) by a read whose day has more
   *  than SITE_GUARD_LEFT to run. Past that the snapshot holds back nothing, so a site that lastingly lists fewer
   *  cities is taken at the run a day after the last good one, instead of leaving no deal and no pin for good. */
  async guarding(exec: Executor): Promise<number> {
    const [row] = await exec
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(sitePlaces)
      .where(gt(sitePlaces.syncedAt, sql`now() - ${SITE_ROUTE_VALID} + ${SITE_GUARD_LEFT}`));
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
   * tonight — what the last read had for them stays, its routes with the day their own read gave them (ADR-IMPL-067):
   * a city that keeps failing goes out of the deals within a day. A city's routes go with it (the foreign key cascades),
   * so a deal the site dropped is gone with this transaction. Every route written is served for a day from now.
   */
  async replace(
    exec: Executor,
    plan: { places: readonly SitePlace[]; routes: readonly SiteRoute[] },
    keep: readonly number[],
  ): Promise<void> {
    await exec.delete(sitePlaces).where(keep.length > 0 ? notInArray(sitePlaces.cmsId, [...keep]) : undefined);
    const now = sql`now()`;
    const until = sql`now() + ${SITE_ROUTE_VALID}`;
    for (let i = 0; i < plan.places.length; i += 500) {
      await exec
        .insert(sitePlaces)
        .values(plan.places.slice(i, i + 500).map((p) => ({ ...p, syncedAt: now })))
        .onConflictDoNothing({ target: sitePlaces.cmsId });
    }
    for (let i = 0; i < plan.routes.length; i += 500) {
      await exec
        .insert(siteRoutes)
        .values(plan.routes.slice(i, i + 500).map((r) => ({ ...r, syncedAt: now, validUntil: until })))
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
   *  cities listed from `home`, the ones on the site's home page first, then by their main airport's traffic. Only the
   *  routes still served `marginS` seconds from now (ADR-IMPL-067): a city the site has not listed for a day is no pin
   *  either, nor one whose day ends while the pins are kept. */
  pinsSelect(exec: Executor, home: string, limit: number, marginS = 0) {
    return exec
      .select({
        cmsId: sitePlaces.cmsId,
        airports: sitePlaces.airports,
        airport: airports,
      })
      .from(siteRoutes)
      .innerJoin(sitePlaces, eq(sitePlaces.cmsId, siteRoutes.cmsId))
      .innerJoin(airports, eq(airports.code, sitePlaces.airport))
      .where(and(eq(siteRoutes.routeFrom, home.toUpperCase()), served(marginS)))
      .orderBy(desc(sitePlaces.promoted), desc(airports.popularity), asc(airports.code))
      .limit(limit);
  },

  async pinsFrom(exec: Executor, home: string, limit: number, marginS = 0) {
    const rows = await this.pinsSelect(exec, home, limit, marginS);
    return rows.map((r) => ({ ...r, airports: r.airports.map((c) => c.trim()) }));
  },

  /**
   * ADR-IMPL-067: every US airport the site lists a deal from that is still served `marginS` seconds from now, where it
   * is, and how many deals it has — what the nearest-origin rule needs (`application/site-deals.ts`). About 27 rows.
   */
  async dealOrigins(exec: Executor, marginS: number) {
    const rows = await exec
      .select({
        code: siteRoutes.routeFrom,
        city: airports.city,
        lat: airports.lat,
        lng: airports.lng,
        deals: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(siteRoutes)
      .innerJoin(airports, eq(airports.code, siteRoutes.routeFrom))
      .where(served(marginS))
      .groupBy(siteRoutes.routeFrom, airports.city, airports.lat, airports.lng);
    return rows.map((r) => ({
      code: r.code.trim(),
      city: r.city,
      lat: Number(r.lat),
      lng: Number(r.lng),
      deals: r.deals,
    }));
  },

  /**
   * ADR-IMPL-067: the deals from these airports still served `marginS` seconds from now, in the pins' order — the site's
   * home page first, then the destination's traffic, then its code — each with its destination's main airport, every
   * airport of the city, and (with `photos`) the city's place photo as `GET /v1/places/photos` reads it. The site's "Old
   * Price" is not read: it is never served.
   */
  async dealsFrom(exec: Executor, from: readonly string[], marginS: number, photos: boolean) {
    if (from.length === 0) return [];
    const rows = await exec
      .select({
        routeFrom: siteRoutes.routeFrom,
        cmsId: siteRoutes.cmsId,
        deal: siteRoutes.deal,
        price: siteRoutes.price,
        validUntil: siteRoutes.validUntil,
        airports: sitePlaces.airports,
        airport: airports,
        photo: {
          code: placePhotos.code,
          status: placePhotos.status,
          source: placePhotos.source,
          cardUrl: placePhotos.cardUrl,
          heroUrl: placePhotos.heroUrl,
          author: placePhotos.author,
          license: placePhotos.license,
          link: placePhotos.link,
          lat: placePhotos.lat,
          lng: placePhotos.lng,
        },
      })
      .from(siteRoutes)
      .innerJoin(sitePlaces, eq(sitePlaces.cmsId, siteRoutes.cmsId))
      .innerJoin(airports, eq(airports.code, sitePlaces.airport))
      .leftJoin(placePhotos, photos ? eq(placePhotos.code, sitePlaces.airport) : sql`false`)
      .where(and(inArray(siteRoutes.routeFrom, [...from]), served(marginS)))
      .orderBy(desc(sitePlaces.promoted), desc(airports.popularity), asc(airports.code), asc(siteRoutes.routeFrom));
    return rows.map((r) => ({
      routeFrom: r.routeFrom.trim(),
      cmsId: r.cmsId,
      deal: r.deal,
      price: r.price,
      validUntil: r.validUntil,
      airports: r.airports.map((c) => c.trim()),
      airport: r.airport,
      photo: r.photo && r.photo.code !== null ? (r.photo as PlacePhotoRow) : null,
    }));
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
