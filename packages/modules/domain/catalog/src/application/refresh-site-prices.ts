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
 * Its flags (`stillOn`: estimates, the site's prices, the site's pins) are read before each question: one turned off
 * stops the run. An error stores nothing: the stored answer, if any, stays until it expires. A route the site could not
 * answer waits `FAILED_RETRY_MS` (this process remembers it, as it keeps its breaker), then goes after every route never
 * asked and every due one — so a route the site keeps failing never holds back the routes after it, nor reopens the
 * breaker at the head of each run. Then it deletes the expired answers (the module's handler deletes them too while a
 * flag is off, without asking anything).
 * What it stores is idempotent: a route it stored is not asked again until it is due (answered
 * `SITE_PRICE_REFRESH_HOURS` or more ago), so repeating a run rewrites no answer that is not due. It is not done in one
 * run: while more than `REFRESH_BUDGET` routes need asking (an environment's first runs: the pins' routes are hundreds),
 * each run takes the next ones, and a run stopped by a 429, the breaker or a flag leaves the rest to the next.
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
/** A route the site could not answer (a timeout, a 5xx, a failed connection, a body not its shape, our request refused)
 *  is not asked again for this long; then it goes last. The site's 429 and the breaker are not the route's: neither
 *  counts. */
export const FAILED_RETRY_MS = 60 * 60_000;
/** A failure this old is forgotten: it says no more than none, and routes that left the pins leave the map too. */
const FAILED_FORGET_MS = 24 * 3_600_000;

export type PinRoute = { from: GuardAirport; to: GuardAirport };

/** When the site last failed each route, by the job's clock, keyed `FROM-TO`. One per process, as the breaker is: a
 *  restart forgets it, and a route is then asked once more before it waits again. */
export type FailedRoutes = Map<string, number>;

/**
 * The routes to ask this run, in order: no stored answer first (in the pins' order), then the due ones, the soonest to
 * expire first, then the ones the site failed `FAILED_RETRY_MS` or more ago, the oldest failure first; a route it failed
 * more recently is not asked (`backingOff`). `routes` is in the pins' order per home (sitePricesRepo.pinRoutes);
 * `stored` and `failed` keys are `FROM-TO`.
 */
export function dueRoutes(
  routes: readonly PinRoute[],
  stored: ReadonlyMap<string, StoredExpiry>,
  opts: { perHome?: number; budget?: number; failed?: ReadonlyMap<string, number>; now?: number } = {},
): { routes: PinRoute[]; backingOff: number } {
  const perHome = opts.perHome ?? PIN_CANDIDATES;
  const budget = opts.budget ?? REFRESH_BUDGET;
  const now = opts.now ?? Date.now();
  const counted = new Map<string, number>();
  const seen = new Set<string>();
  const missing: PinRoute[] = [];
  const due: (PinRoute & { expiresAt: number })[] = [];
  const retry: (PinRoute & { failedAt: number })[] = [];
  let backingOff = 0;
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
    if (row && !row.due) continue; // fresh (a search may have stored it since the site failed the job)
    const failedAt = opts.failed?.get(key);
    if (failedAt !== undefined) {
      if (now - failedAt < FAILED_RETRY_MS) backingOff += 1;
      else retry.push({ ...r, failedAt });
    } else if (!row) missing.push(r);
    else due.push({ ...r, expiresAt: row.expiresAt.getTime() });
  }
  due.sort((a, b) => a.expiresAt - b.expiresAt);
  retry.sort((a, b) => a.failedAt - b.failedAt);
  const route = ({ from, to }: PinRoute): PinRoute => ({ from, to });
  return { routes: [...missing, ...due.map(route), ...retry.map(route)].slice(0, budget), backingOff };
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
  /** 1 when a flag the job runs under was turned off during the run, and stopped it. */
  stopped: number;
  /** Routes not asked: the site failed them less than `FAILED_RETRY_MS` ago. */
  backingOff: number;
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
    /** Whether the job may still ask the site — its flags, read before each question (they are cached), so turning
     *  one off stops a run already going (AGENTS rule 3: the state at the moment of the call). */
    stillOn: () => Promise<boolean>;
    /** The routes the site failed, kept by the module from run to run; this run adds and clears its own. */
    failed: FailedRoutes;
  },
  opts: { budget?: number; gapMs?: number; perHome?: number } = {},
): Promise<RefreshReport> {
  const gapMs = opts.gapMs ?? REFRESH_GAP_MS;
  for (const [key, at] of deps.failed) if (deps.clock.now() - at >= FAILED_FORGET_MS) deps.failed.delete(key);
  const [routes, stored] = await Promise.all([
    sitePricesRepo.pinRoutes(deps.db),
    sitePricesRepo.expiries(deps.db, "round_trip"),
  ]);
  const { routes: all, backingOff } = dueRoutes(routes, stored, {
    perHome: opts.perHome,
    budget: Number.MAX_SAFE_INTEGER,
    failed: deps.failed,
    now: deps.clock.now(),
  });
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
    stopped: 0,
    backingOff,
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
    if (!(await deps.stillOn())) {
      report.stopped = 1;
      deps.logger.warn({ asked: report.asked }, "site prices: a flag was turned off, the run stops");
      break;
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
      deps.failed.set(`${q.from}-${q.to}`, deps.clock.now());
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
    deps.failed.delete(`${q.from}-${q.to}`);
    deps.metrics.inc("site_prices_answered", { status: answer.kind });
    if (answer.kind === "priced") report.priced += 1;
    else report.none += 1;
  }
  report.purged = await sitePricesRepo.purgeExpired(deps.db);
  return report;
}
