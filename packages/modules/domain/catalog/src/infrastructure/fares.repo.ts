import type { Executor } from "@bbc/db";
import { statement } from "@bbc/db/statements";
import { and, asc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { isIanaZone, zoneDayBounds } from "@bbc/shared/time-zone";
import { eqConst } from "@bbc/db/helpers";
import { alias } from "drizzle-orm/pg-core";
import { airports, fares } from "@bbc/db/schema/catalog";

export type SearchQuery = {
  from: string;
  to: string;
  cabin: "business" | "first";
  /** The travel day (its UTC date part: the app sends noon UTC of the chosen day). Absent: any day. */
  when?: Date;
  /** For tests: the instant the sale window is read at. */
  now?: Date;
  /** The origin airport's zone, when the caller has it (the route reads the airports from memory): the travel day's
   *  bounds are then computed here and compared with `depart_at` as they are (ADR-IMPL-077). Absent: read in SQL. */
  originTz?: string;
};

/** The fare's origin airport, for the zone its departure day is read in. */
const origin = alias(airports, "origin");

export const SEARCH_LIMIT = 30; // the same page the future FT.SEARCH … LIMIT 0 30 returns — one contract for both paths

/** A fare by id (its page, a quote), built once per executor (ADR-IMPL-074). */
const fareRead = statement("catalog_fare", (e) =>
  e
    .select()
    .from(fares)
    .where(eq(fares.id, sql.placeholder("id")))
    .limit(1),
);

export const faresRepo = {
  /**
   * ADR-IMPL-041 (amended): a fare is listed only while it is on sale — published, valid_from ≤ now < valid_until, the
   * rule GET /v1/fares/:id reads, so no item opens on a 410. A travel date then picks a timed fare (depart_at set) by
   * its departure day in the origin airport's zone, and an undated one while it is still sold on that day.
   */
  searchSelect(exec: Executor, q: SearchQuery) {
    const now = q.now ?? new Date();
    const originTz = exec.select({ tz: origin.tz }).from(origin).where(eq(origin.code, fares.routeFrom));
    const day = q.when?.toISOString().slice(0, 10);
    // With the origin's zone at hand, the day is two instants and `depart_at` stays bare on its side of the comparison;
    // without it, the zone is read per row as before.
    const bounds = day && q.originTz && isIanaZone(q.originTz) ? zoneDayBounds(day, q.originTz) : null;
    const timedOnDay = bounds
      ? and(gte(fares.departAt, bounds.start), lt(fares.departAt, bounds.end))
      : sql`(${fares.departAt} AT TIME ZONE coalesce((${originTz}), 'UTC'))::date = ${day}::date`;
    const onDay = q.when
      ? or(and(isNotNull(fares.departAt), timedOnDay), and(isNull(fares.departAt), gt(fares.validUntil, q.when)))
      : undefined;
    return exec
      .select()
      .from(fares)
      .where(
        and(
          eqConst(fares.published, true),
          eq(fares.routeFrom, q.from.toUpperCase()),
          eq(fares.routeTo, q.to.toUpperCase()),
          eq(fares.cabin, q.cabin),
          lte(fares.validFrom, now),
          gt(fares.validUntil, now),
          onDay,
        ),
      )
      .orderBy(asc(fares.price))
      .limit(SEARCH_LIMIT);
  },

  /** Visible published fares in the validity window. Filters in SQL. At most SEARCH_LIMIT rows, cheapest first. */
  async search(exec: Executor, q: SearchQuery) {
    return this.searchSelect(exec, q);
  },

  /** Any row by id (ignore published/window) — caller maps expired → 410. */
  async getAny(exec: Executor, id: string) {
    const [row] = await fareRead(exec, { id });
    return row ?? null;
  },

  /** Same SELECT DISTINCT ON the destinations() path uses — hot-query tests EXPLAIN this builder. */
  destinationsSelect(exec: Executor, home: string, now = new Date()) {
    const homeCode = home.toUpperCase();
    return exec
      .selectDistinctOn([fares.routeTo], {
        code: fares.routeTo,
        name: airports.name,
        city: airports.city,
        countryCode: airports.countryCode,
        region: airports.region,
        lat: airports.lat,
        lng: airports.lng,
        description: airports.description,
        fromPrice: fares.price,
      })
      .from(fares)
      .innerJoin(airports, eq(airports.code, fares.routeTo))
      .where(
        and(
          eqConst(fares.published, true),
          eq(fares.routeFrom, homeCode),
          lte(fares.validFrom, now),
          gt(fares.validUntil, now),
        ),
      )
      .orderBy(asc(fares.routeTo), asc(fares.price)); // DISTINCT ON keeps the first row per routeTo = the cheapest
  },

  /** Cheapest published fare per destination from `home`, with airport enrichment. hasOffer left to BFF.
   *  DISTINCT ON (route_to) keeps the first row of ORDER BY route_to, price — the cheapest. */
  async destinations(exec: Executor, home: string) {
    const rows = await this.destinationsSelect(exec, home);
    return rows.map((r) => ({
      ...r,
      lat: parseFloat(String(r.lat)),
      lng: parseFloat(String(r.lng)),
      fromPrice: parseFloat(String(r.fromPrice)),
    }));
  },

  async expirePast(exec: Executor, now = new Date()) {
    const expired = await exec
      .update(fares)
      .set({ published: false, updatedAt: sql`now()` })
      .where(and(eqConst(fares.published, true), lt(fares.validUntil, now)))
      .returning({ id: fares.id });
    return expired.length;
  },

  /** Whether a published fare is past its time. The expiry runs its UPDATE only then: an UPDATE of no row still fires
   *  the table's statement trigger and moves catalog.fares' generation, emptying every cache built on it (X11). */
  async anyToExpire(exec: Executor, now = new Date()) {
    const [row] = await exec
      .select({ one: sql<number>`1` })
      .from(fares)
      .where(and(eqConst(fares.published, true), lt(fares.validUntil, now)))
      .limit(1);
    return row !== undefined;
  },

  async upsertImport(
    exec: Executor,
    row: {
      routeFrom: string;
      routeTo: string;
      cabin: "business" | "first";
      carrier: string | null;
      carrierName: string | null;
      product: string | null;
      nonstop: boolean;
      durationMinutes: number | null;
      price: string;
      publishedPrice: string | null;
      publishedSource: string | null;
      currency: string;
      /** What the price is for (ADR-IMPL-056): the row says it, or one way. Part of the fare's identity (0034): the same
       *  route sold one way and round trip is two fares. */
      trip: "round_trip" | "one_way";
      validFrom: Date;
      validUntil: Date;
    },
  ) {
    const [inserted] = await exec
      .insert(fares)
      .values({
        ...row,
        source: "import",
        published: true,
      })
      .onConflictDoUpdate({
        // fares_route_cabin_carrier (0034): the trip in it, a NULL carrier not distinct — a carrier-less fare re-imported
        // is the same fare, and one route sold one way and round trip is two.
        target: [fares.routeFrom, fares.routeTo, fares.cabin, fares.carrier, fares.validFrom, fares.trip],
        set: {
          carrierName: row.carrierName,
          product: row.product,
          nonstop: row.nonstop,
          durationMinutes: row.durationMinutes,
          price: row.price,
          publishedPrice: row.publishedPrice,
          publishedSource: row.publishedSource,
          currency: row.currency,
          validUntil: row.validUntil,
          published: true,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: fares.id });
    return inserted?.id ?? null;
  },
};
