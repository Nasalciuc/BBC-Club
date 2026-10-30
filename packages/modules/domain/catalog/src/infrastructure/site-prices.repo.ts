import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { anyOf } from "@bbc/db/helpers";
import { alias } from "drizzle-orm/pg-core";
import { airports, sitePlaces, sitePrices, siteRoutes } from "@bbc/db/schema/catalog";

import {
  SITE_PRICE_REFRESH_HOURS,
  SITE_PRICE_TTL_HOURS,
  type SiteFigures,
  type SiteTrip,
  type StoredExpiry,
  type StoredSitePrice,
} from "../application/site-prices";

const ttl = sql.raw(`interval '${SITE_PRICE_TTL_HOURS} hours'`);
/** A row is due this long before it expires: when it was answered `SITE_PRICE_REFRESH_HOURS` ago. */
const refreshMargin = sql.raw(`interval '${SITE_PRICE_TTL_HOURS - SITE_PRICE_REFRESH_HOURS} hours'`);

type Row = typeof sitePrices.$inferSelect;
const stored = (r: Row): StoredSitePrice => ({
  status: r.status,
  business: r.business,
  first: r.first,
  premiumEconomy: r.premiumEconomy,
  fetchedAt: r.fetchedAt,
});

/** ADR-IMPL-063. What the company's site answered, per route and trip; a row is read only until it expires. */
export const sitePricesRepo = {
  /** The site's answer for one route, unless it has expired. */
  async fresh(exec: Executor, from: string, to: string, trip: SiteTrip): Promise<StoredSitePrice | null> {
    const [row] = await exec
      .select()
      .from(sitePrices)
      .where(
        and(
          eq(sitePrices.routeFrom, from.toUpperCase()),
          eq(sitePrices.routeTo, to.toUpperCase()),
          eq(sitePrices.trip, trip),
          gt(sitePrices.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    return row ? stored(row) : null;
  },

  /** The site's answers from `from` to each of `tos`, in one read: Home's site pins. `keepS`: how long the caller keeps
   *  what it read (the pins' cache) — an answer that expires before then is not read, so none is shown past 24 hours. */
  async freshFrom(
    exec: Executor,
    from: string,
    tos: readonly string[],
    trip: SiteTrip,
    keepS = 0,
  ): Promise<Map<string, StoredSitePrice>> {
    if (tos.length === 0) return new Map();
    const rows = await exec
      .select()
      .from(sitePrices)
      .where(
        and(
          eq(sitePrices.routeFrom, from.toUpperCase()),
          anyOf(sitePrices.routeTo, [...new Set(tos.map((c) => c.toUpperCase()))], "bpchar"),
          eq(sitePrices.trip, trip),
          gt(sitePrices.expiresAt, sql`now() + make_interval(secs => ${keepS})`),
        ),
      );
    return new Map(rows.map((r) => [r.routeTo.trim(), stored(r)]));
  },

  /**
   * Stores what the site answered — its figures, or that the company has none — asked now and shown for 24 hours.
   * Idempotent: the route's row is replaced, its `created_at` kept. Never called for an error.
   */
  async store(
    exec: Executor,
    q: { from: string; to: string; trip: SiteTrip },
    answer: { kind: "priced"; figures: SiteFigures } | { kind: "none" },
  ): Promise<StoredSitePrice> {
    const figures =
      answer.kind === "priced"
        ? {
            business: answer.figures.business,
            first: answer.figures.first,
            premiumEconomy: answer.figures.premiumEconomy,
          }
        : { business: null, first: null, premiumEconomy: null };
    const values = {
      status: answer.kind,
      ...figures,
      fetchedAt: sql`now()`,
      expiresAt: sql`now() + ${ttl}`,
    };
    const [row] = await exec
      .insert(sitePrices)
      .values({ routeFrom: q.from.toUpperCase(), routeTo: q.to.toUpperCase(), trip: q.trip, ...values })
      .onConflictDoUpdate({ target: [sitePrices.routeFrom, sitePrices.routeTo, sitePrices.trip], set: values })
      .returning();
    if (!row) throw new Error("site price upsert returned no row");
    return stored(row);
  },

  /**
   * The routes Home's site pins are drawn from (ADR-IMPL-045): every airport the site lists a price from, to each of its
   * cities' main airports, in the order `siteRepo.pinsSelect` reads them (the site's home page first, then the busiest,
   * then by code), with what the guards need of both airports. The caller keeps each home's first candidates. Only the
   * routes still served (ADR-IMPL-067), as the pins read them.
   */
  async pinRoutes(exec: Executor) {
    const home = alias(airports, "home");
    const dest = alias(airports, "dest");
    const rows = await exec
      .select({
        from: { code: home.code, countryCode: home.countryCode, lat: home.lat, lng: home.lng },
        to: { code: dest.code, countryCode: dest.countryCode, lat: dest.lat, lng: dest.lng },
      })
      .from(siteRoutes)
      .innerJoin(sitePlaces, eq(sitePlaces.cmsId, siteRoutes.cmsId))
      .innerJoin(dest, eq(dest.code, sitePlaces.airport))
      .innerJoin(home, eq(home.code, siteRoutes.routeFrom))
      .where(gt(siteRoutes.validUntil, sql`now()`))
      .orderBy(asc(siteRoutes.routeFrom), desc(sitePlaces.promoted), desc(dest.popularity), asc(dest.code));
    const at = (a: { code: string; countryCode: string; lat: string; lng: string }) => ({
      code: a.code.trim(),
      countryCode: a.countryCode,
      lat: Number(a.lat),
      lng: Number(a.lng),
    });
    return rows.map((r) => ({ from: at(r.from), to: at(r.to) }));
  },

  /** When each stored answer for `trip` expires, and whether it is due — answered `SITE_PRICE_REFRESH_HOURS` or more
   *  ago, by the database's clock — keyed `FROM-TO`: what the job reads to tell due from fresh. */
  async expiries(exec: Executor, trip: SiteTrip): Promise<Map<string, StoredExpiry>> {
    const rows = await exec
      .select({
        from: sitePrices.routeFrom,
        to: sitePrices.routeTo,
        expiresAt: sitePrices.expiresAt,
        due: sql<boolean>`${sitePrices.expiresAt} <= now() + ${refreshMargin}`,
      })
      .from(sitePrices)
      .where(eq(sitePrices.trip, trip));
    return new Map(rows.map((r) => [`${r.from.trim()}-${r.to.trim()}`, { expiresAt: r.expiresAt, due: r.due }]));
  },

  /** Deletes the answers that are no longer shown; returns how many. */
  async purgeExpired(exec: Executor): Promise<number> {
    const rows = await exec
      .delete(sitePrices)
      .where(lte(sitePrices.expiresAt, sql`now()`))
      .returning({ from: sitePrices.routeFrom });
    return rows.length;
  },
};
