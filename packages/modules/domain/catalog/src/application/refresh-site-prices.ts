/**
 * The refresh-site-prices job (ADR-IMPL-063): keeps the company's site's answers stored for the routes Home's site pins
 * show, so a pin — which never calls the site — shows the site's price, and a quote from it records the same number.
 *
 * Which routes, simply and bounded: for every airport the site lists a price from (`catalog.site_routes`, a nightly
 * snapshot, ADR-IMPL-045), the first `PIN_CANDIDATES` of its cities in the order the pins read them — exactly the
 * candidates a member whose home it is can be shown — round trip, the only trip an estimate shows. Of those, the routes
 * with no stored answer first (in that order), then the ones answered 18 or more hours ago, oldest first; at most
 * `REFRESH_BUDGET` a run, one starting every `REFRESH_GAP_MS` (about two a second). Routes the club never prices (one
 * airport, one metro, no end in North America) are never asked. Routes searched outside the pins are not refreshed:
 * their answer expires and the next search asks again.
 *
 * It respects the breaker (nothing asked while it is open; it stops when it opens) and stops at the site's first 429.
 * An error stores nothing: the stored answer, if any, stays until it expires. Then it deletes the expired answers.
 * Running it twice changes nothing the second time: every route it asked is fresh.
 */
import type { Executor } from "@bbc/db";

import { sitePricesRepo } from "../infrastructure/site-prices.repo";
import type { SiteClock } from "./site-cms";
import {
  JOB_TIMEOUT_MS,
  routeWithoutPrice,
  type GuardAirport,
  type SitePriceClient,
  type StoredExpiry,
} from "./site-prices";

/** At most this many questions a run (every ten minutes: at most 900 an hour, far fewer once the pins are stored). */
export const REFRESH_BUDGET = 150;
/** One question starting this long after the last: about two a second. */
export const REFRESH_GAP_MS = 500;
/** Each home's candidates, as Home reads them: `SITE_PINS` × 3 (module.ts). */
export const PIN_CANDIDATES = 36;

export type PinRoute = { from: GuardAirport; to: GuardAirport };

/**
 * The routes to ask this run, in order: no stored answer first (in the pins' order), then the due ones, the soonest to
 * expire first. `routes` is in the pins' order per home (sitePricesRepo.pinRoutes); `stored` keys are `FROM-TO`.
 */
export function dueRoutes(
  routes: readonly PinRoute[],
  stored: ReadonlyMap<string, StoredExpiry>,
  opts: { perHome?: number; budget?: number } = {},
): PinRoute[] {
  const perHome = opts.perHome ?? PIN_CANDIDATES;
  const budget = opts.budget ?? REFRESH_BUDGET;
  const counted = new Map<string, number>();
  const seen = new Set<string>();
  const missing: PinRoute[] = [];
  const due: (PinRoute & { expiresAt: number })[] = [];
  for (const r of routes) {
    // Counted as the pins' LIMIT counts: a row per city, two cities on one airport included.
    const n = counted.get(r.from.code) ?? 0;
    if (n >= perHome) continue;
    counted.set(r.from.code, n + 1);
    const key = `${r.from.code}-${r.to.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (routeWithoutPrice(r.from, r.to)) continue;
    const row = stored.get(key);
    if (!row) missing.push(r);
    else if (row.due) due.push({ ...r, expiresAt: row.expiresAt.getTime() });
  }
  due.sort((a, b) => a.expiresAt - b.expiresAt);
  return [...missing, ...due.map(({ from, to }) => ({ from, to }))].slice(0, budget);
}

export type RefreshReport = {
  skipped: number;
  /** Routes that needed asking, before the budget. */
  due: number;
  asked: number;
  priced: number;
  none: number;
  failed: number;
  /** 1 when the site's 429 stopped the run. */
  rateLimited: number;
  /** 1 when the breaker was open, or opened, and stopped the run. */
  breakerOpen: number;
  purged: number;
};

export async function refreshSitePrices(
  deps: {
    db: Executor;
    client: SitePriceClient;
    clock: SiteClock;
    signal: AbortSignal;
    metrics: { inc(name: string, labels?: Record<string, string>, by?: number): void };
    logger: { warn(obj: object, msg: string): void; error(obj: object, msg: string): void };
  },
  opts: { budget?: number; gapMs?: number; perHome?: number } = {},
): Promise<RefreshReport> {
  const gapMs = opts.gapMs ?? REFRESH_GAP_MS;
  const [routes, stored] = await Promise.all([
    sitePricesRepo.pinRoutes(deps.db),
    sitePricesRepo.expiries(deps.db, "round_trip"),
  ]);
  const all = dueRoutes(routes, stored, { perHome: opts.perHome, budget: Number.MAX_SAFE_INTEGER });
  const todo = all.slice(0, opts.budget ?? REFRESH_BUDGET);
  const report: RefreshReport = {
    skipped: 0,
    due: all.length,
    asked: 0,
    priced: 0,
    none: 0,
    failed: 0,
    rateLimited: 0,
    breakerOpen: 0,
    purged: 0,
  };
  let lastStart = Number.NEGATIVE_INFINITY;
  for (const r of todo) {
    if (deps.signal.aborted) break;
    const wait = lastStart + gapMs - deps.clock.now();
    if (wait > 0) {
      try {
        await deps.clock.sleep(wait, deps.signal);
      } catch {
        break; // the job's time is up
      }
    }
    lastStart = deps.clock.now();
    const q = { from: r.from.code, to: r.to.code, trip: "round_trip" as const };
    const answer = await deps.client.ask(q, { timeoutMs: JOB_TIMEOUT_MS, signal: deps.signal });
    // The job's time ran out during the question: not the site's failure, and nothing more to ask.
    if (answer.kind === "unavailable" && deps.signal.aborted) break;
    if (answer.kind === "unavailable" && answer.reason === "breaker") {
      deps.metrics.inc("site_prices_unavailable", { reason: "breaker" });
      report.breakerOpen = 1;
      break;
    }
    report.asked += 1;
    if (answer.kind === "unavailable") {
      report.failed += 1;
      deps.metrics.inc("site_prices_unavailable", { reason: answer.reason });
      if (answer.reason === "bad_request") {
        // Our request, refused: a bug of ours, never the site's outage. Codes only, never a price.
        deps.logger.error({ from: q.from, to: q.to }, "site price refused our request (400)");
      }
      if (answer.reason === "rate_limited") {
        report.rateLimited = 1;
        deps.logger.warn({ asked: report.asked }, "site prices: the site's rate limit, the run stops");
        break;
      }
      if (deps.client.breaker.state() !== "closed") {
        report.breakerOpen = 1;
        deps.logger.warn(
          { asked: report.asked, failed: report.failed },
          "site prices: the breaker opened, the run stops",
        );
        break;
      }
      continue;
    }
    await sitePricesRepo.store(deps.db, q, answer);
    deps.metrics.inc("site_prices_answered", { status: answer.kind });
    if (answer.kind === "priced") report.priced += 1;
    else report.none += 1;
  }
  report.purged = await sitePricesRepo.purgeExpired(deps.db);
  return report;
}
