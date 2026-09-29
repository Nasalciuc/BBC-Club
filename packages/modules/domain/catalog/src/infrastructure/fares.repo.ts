import type { Executor } from "@bbc/db";
import { and, asc, eq, gt, lt, lte, sql } from "drizzle-orm";
import { airports, fares } from "@bbc/db/schema/catalog";

export type SearchQuery = {
  from: string;
  to: string;
  cabin: "business" | "first";
  when?: Date;
};

export const SEARCH_LIMIT = 30; // the same page the future FT.SEARCH … LIMIT 0 30 returns — one contract for both paths

export const faresRepo = {
  searchSelect(exec: Executor, q: SearchQuery) {
    const now = q.when ?? new Date();
    return exec
      .select()
      .from(fares)
      .where(
        and(
          eq(fares.published, true),
          eq(fares.routeFrom, q.from.toUpperCase()),
          eq(fares.routeTo, q.to.toUpperCase()),
          eq(fares.cabin, q.cabin),
          lte(fares.validFrom, now),
          gt(fares.validUntil, now),
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
    const [row] = await exec.select().from(fares).where(eq(fares.id, id)).limit(1);
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
        fromPrice: fares.price,
      })
      .from(fares)
      .innerJoin(airports, eq(airports.code, fares.routeTo))
      .where(
        and(
          eq(fares.published, true),
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
      .where(and(eq(fares.published, true), lt(fares.validUntil, now)))
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
        target: [fares.routeFrom, fares.routeTo, fares.cabin, fares.carrier, fares.validFrom],
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
