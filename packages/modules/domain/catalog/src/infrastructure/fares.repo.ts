import type { Executor } from "@bbc/db";
import { statement } from "@bbc/db/statements";
import { and, asc, eq, getTableColumns, gt, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { isIanaZone } from "@bbc/shared/time-zone";
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
   *  bounds and the departures' clocks are then read with it, bound once, instead of an airport read per fare
   *  (ADR-IMPL-077). Absent: the zone is read per row. */
  originTz?: string;
  /** The destination airport's zone, likewise, for the arrivals' clocks. */
  destTz?: string;
};

/** The fare's origin airport, for the zone its departure day is read in. */
const origin = alias(airports, "origin");
/** The fare's destination airport, for the zone its arrival's clock is read in. */
const dest = alias(airports, "dest");

/** An instant's wall clock in a zone, by Postgres's tzdata — the one rule for a fare's day and its clocks (#114,
 *  ADR-IMPL-077): `2026-12-15T00:30`, or null with no instant or no zone. */
const wallAt = (instant: AnyPgColumn, tz: SQL | AnyPgColumn | string) =>
  sql<string | null>`to_char(${instant} AT TIME ZONE ${tz}, 'YYYY-MM-DD"T"HH24:MI')`;

/**
 * The first instant whose wall clock in `tz` reads the date `day` — what `(t AT TIME ZONE tz)::date = day` holds from,
 * by the same tzdata, bound as constants so `depart_at` is compared bare. `day::timestamp AT TIME ZONE tz` alone is
 * that instant except on a day whose midnight happens twice (a clock turned back at 01:00 to 00:00, as in Havana and
 * the Azores), where Postgres takes the later one; the instant an hour before 00:00, plus the hour, is then the
 * earlier. Checked against Postgres's own day for every zone and day of two years (`scripts/tz-parity.test.ts`).
 */
export const dayStartIn = (day: SQL, tz: string) =>
  sql`least((${day})::timestamp AT TIME ZONE ${tz}, (((${day})::timestamp - interval '1 hour') AT TIME ZONE ${tz}) + interval '1 hour')`;

export const SEARCH_LIMIT = 30; // the same page the future FT.SEARCH … LIMIT 0 30 returns — one contract for both paths

/** A fare by id (its page, a quote), built once per executor (ADR-IMPL-074), with its clocks in its airports' zones. */
const fareRead = statement("catalog_fare", (e) =>
  e
    .select({
      ...getTableColumns(fares),
      departWall: wallAt(fares.departAt, origin.tz),
      arriveWall: wallAt(fares.arriveAt, dest.tz),
    })
    .from(fares)
    .leftJoin(origin, eq(origin.code, fares.routeFrom))
    .leftJoin(dest, eq(dest.code, fares.routeTo))
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
    const destTz = exec.select({ tz: dest.tz }).from(dest).where(eq(dest.code, fares.routeTo));
    const day = q.when?.toISOString().slice(0, 10);
    const fromZone = q.originTz && isIanaZone(q.originTz) ? q.originTz : null;
    const toZone = q.destTz && isIanaZone(q.destTz) ? q.destTz : null;
    // With the origin's zone at hand, the day is two instants Postgres computes once and `depart_at` stays bare on its
    // side of the comparison; without it, the zone is read per row as before.
    const timedOnDay = fromZone
      ? and(
          gte(fares.departAt, dayStartIn(sql`${day}::date`, fromZone)),
          lt(fares.departAt, dayStartIn(sql`${day}::date + 1`, fromZone)),
        )
      : sql`(${fares.departAt} AT TIME ZONE coalesce((${originTz}), 'UTC'))::date = ${day}::date`;
    const onDay = q.when
      ? or(and(isNotNull(fares.departAt), timedOnDay), and(isNull(fares.departAt), gt(fares.validUntil, q.when)))
      : undefined;
    return exec
      .select({
        ...getTableColumns(fares),
        departWall: wallAt(fares.departAt, fromZone ?? sql`(${originTz})`),
        arriveWall: wallAt(fares.arriveAt, toZone ?? sql`(${destTz})`),
      })
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
