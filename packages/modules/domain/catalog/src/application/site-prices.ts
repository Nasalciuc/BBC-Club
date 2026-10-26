/**
 * The company's site as the club's indicative price source (ADR-IMPL-063, D6). The site's own search —
 * `GET https://webapi.buybusinessclass.com/flights/search?from=&to=&trip_type=round_trip|one_way` — answers the company's
 * formula with the company's current rules: `{ premium_economy, business, first }`, whole USD per person, for every route
 * with an end in North America; 404 `{"error":"Offer not found"}` where neither end is, 404 `{"message":"Not found"}`
 * for an airport it does not know — both mean the company has no price there; 400 is a request of ours it refuses.
 *
 * The order, per route and cabin (`resolveIndicative`): a published fare (the caller's, unchanged) → the site's answer
 * stored less than 24 hours ago (`catalog.site_prices`) → for an undated search only, one live call bounded by a second,
 * which stores what it learns → the club's copy of the formula, only when the site could not be asked (breaker open,
 * timeout, 5xx, 429, a body not its shape) or, for Home's pins and a quote request, which never call it, when no answer
 * is stored → nothing. A `none` answer is no number at all, not the formula: the member gets "Request a quote".
 *
 * One client per process (`sitePriceClient`), with a breaker: five failures in a row open it for a minute, then one call
 * is let through; while it is open nothing is asked, so an outage costs the search nothing.
 */
import { z } from "zod";

import { CONTINENT_OF } from "../pricing/continents";
import { SAME_METRO_KM, distanceKm, type PricedAirport } from "../pricing/estimate";
import { SITE_SEARCH } from "../pricing/site-check";
import type { Fetch } from "./place-photo-sources";

export type SiteTrip = "round_trip" | "one_way";
export type Cabin = "business" | "first";

/** The site's figures for a route, whole USD per person. Business always; the others when the site gave a positive
 *  whole number. */
export type SiteFigures = { business: number; first: number | null; premiumEconomy: number | null };

/** Why the site could not be asked or gave no usable answer — never "the company has no price". */
export type SiteUnavailable = "breaker" | "timeout" | "error" | "invalid" | "rate_limited" | "bad_request";

/** What one question to the site came to. */
export type SiteAnswer =
  | { kind: "priced"; figures: SiteFigures }
  /** The company has no price: `no_offer` (no end in North America), `unknown_airport` (a code it does not know). */
  | { kind: "none"; reason: "no_offer" | "unknown_airport" }
  | { kind: "unavailable"; reason: SiteUnavailable };

/** A stored answer (`catalog.site_prices`), as the reads hand it over: only rows that have not expired. */
export type StoredSitePrice = {
  status: "priced" | "none";
  business: number | null;
  first: number | null;
  premiumEconomy: number | null;
  fetchedAt: Date;
};

/** A stored answer's expiry, and whether it is due for the job: answered 18 or more hours ago, or expired. */
export type StoredExpiry = { expiresAt: Date; due: boolean };

/** The search's live call: at most a second (the site's own part took 59–174 ms, a whole cold call up to 377 ms;
 *  a cold start of the site's host takes seconds, and then the search shows the formula). */
export const SEARCH_TIMEOUT_MS = 1_000;
/** A call from the refresh job: long enough for the site's host to wake from idle. */
export const JOB_TIMEOUT_MS = 10_000;
/** A stored answer is shown for this long (D6: never older than 24 hours; the table's CHECK holds it). */
export const SITE_PRICE_TTL_HOURS = 24;
/** The job asks again for a route answered this long ago. */
export const SITE_PRICE_REFRESH_HOURS = 18;
/** The breaker: this many failures in a row open it, for this long; then one call is let through. */
export const BREAKER_THRESHOLD = 5;
export const BREAKER_OPEN_MS = 60_000;

// ── The site's answers ───────────────────────────────────────────────────────

const positiveWhole = z.number().int().positive();
/** 200: business is the price members see; first and premium economy are kept when they are positive whole numbers. */
export const SitePriceBody = z.object({
  business: positiveWhole,
  first: positiveWhole.nullable().catch(null),
  premium_economy: positiveWhole.nullable().catch(null),
});
/** 404 where neither end of the route is in North America. */
const NoOffer = z.object({ error: z.literal("Offer not found") });
/** 404 for an airport code the site does not know. */
const UnknownAirport = z.object({ message: z.literal("Not found") });

/** Reads one response. A 404 is "none" only in one of its two known bodies — another 404 (a gateway's page) is no
 *  answer. Throws only when the body cannot be read (the request's time ran out while it came): the caller says so. */
export async function readSiteAnswer(res: Response): Promise<SiteAnswer> {
  if (res.status === 200 || res.status === 404) {
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "unavailable", reason: "invalid" };
    }
    if (res.status === 200) {
      const parsed = SitePriceBody.safeParse(body);
      if (!parsed.success) return { kind: "unavailable", reason: "invalid" };
      const { business, first, premium_economy } = parsed.data;
      return { kind: "priced", figures: { business, first, premiumEconomy: premium_economy } };
    }
    if (NoOffer.safeParse(body).success) return { kind: "none", reason: "no_offer" };
    if (UnknownAirport.safeParse(body).success) return { kind: "none", reason: "unknown_airport" };
    return { kind: "unavailable", reason: "invalid" };
  }
  await res.text().catch(() => "");
  if (res.status === 429) return { kind: "unavailable", reason: "rate_limited" };
  if (res.status === 400) return { kind: "unavailable", reason: "bad_request" };
  return { kind: "unavailable", reason: "error" };
}

// ── The breaker ─────────────────────────────────────────────────────────────

export type BreakerClock = { now(): number };

/** Closed: every call goes. `threshold` failures in a row open it for `openMs`: no call goes. Then half-open: one call
 *  goes; its success closes the breaker, its failure opens it again. Per process. */
export type Breaker = {
  allow(): boolean;
  success(): void;
  failure(): void;
  /** A call let through that ended for the caller's own sake (its job's time was up): neither success nor failure. */
  abandon(): void;
  state(): "closed" | "open" | "half_open";
};

export function createBreaker(
  clock: BreakerClock = { now: () => Date.now() },
  opts: { threshold?: number; openMs?: number } = {},
): Breaker {
  const threshold = opts.threshold ?? BREAKER_THRESHOLD;
  const openMs = opts.openMs ?? BREAKER_OPEN_MS;
  let failures = 0;
  let openUntil: number | null = null;
  let trial = false;
  return {
    allow() {
      if (openUntil === null) return true;
      if (clock.now() < openUntil || trial) return false;
      trial = true; // half-open: this one call, and no other until it answers
      return true;
    },
    success() {
      failures = 0;
      openUntil = null;
      trial = false;
    },
    failure() {
      failures += 1;
      if (trial || failures >= threshold) openUntil = clock.now() + openMs;
      trial = false;
    },
    abandon() {
      trial = false;
    },
    state() {
      if (openUntil === null) return "closed";
      return clock.now() < openUntil ? "open" : "half_open";
    },
  };
}

// ── The client ──────────────────────────────────────────────────────────────

export type SitePriceDeps = {
  fetch: Fetch;
  /** The club's own User-Agent: `BBCClub/1.0 (<APP_ORIGIN>; site prices)`. */
  userAgent: string;
  /** For the breaker: the system's clock by default. */
  clock?: BreakerClock;
};

export type SitePriceClient = {
  /** One question, within `timeoutMs`. Never throws: an error is an `unavailable` answer. */
  ask(
    q: { from: string; to: string; trip: SiteTrip },
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<SiteAnswer>;
  breaker: Breaker;
};

export function sitePriceClient(deps: SitePriceDeps): SitePriceClient {
  const breaker = createBreaker(deps.clock);
  return {
    breaker,
    async ask(q, opts) {
      if (!breaker.allow()) return { kind: "unavailable", reason: "breaker" };
      const answer = await askOnce(deps, q, opts);
      if (answer.kind !== "unavailable") breaker.success();
      else if (opts.signal?.aborted)
        breaker.abandon(); // stopped by the caller, not the site's failure
      else breaker.failure();
      return answer;
    },
  };
}

async function askOnce(
  deps: SitePriceDeps,
  q: { from: string; to: string; trip: SiteTrip },
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<SiteAnswer> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const query = new URLSearchParams({ from: q.from, to: q.to, trip_type: q.trip });
  const unavailable = (): SiteAnswer => ({ kind: "unavailable", reason: timeout.aborted ? "timeout" : "error" });
  let res: Response;
  try {
    res = await deps.fetch(`${SITE_SEARCH}?${query}`, {
      headers: { "User-Agent": deps.userAgent, Accept: "application/json" },
      signal,
    });
  } catch {
    return unavailable();
  }
  try {
    return await readSiteAnswer(res);
  } catch {
    return unavailable();
  }
}

// ── What a member may see ───────────────────────────────────────────────────

/** An airport as the guards read it. */
export type GuardAirport = PricedAirport;

/**
 * Routes the club never asks the site about, and never prices: one airport (the site prices JFK → JFK), two airports of
 * one metro (JFK–EWR: no flight to price), or no end in North America (the site has no offer there, and says so; the
 * formula has none either). Nothing is shown for them.
 */
export function routeWithoutPrice(from: GuardAirport, to: GuardAirport): boolean {
  if (from.code === to.code) return true;
  if (
    from.lat !== undefined &&
    from.lng !== undefined &&
    to.lat !== undefined &&
    to.lng !== undefined &&
    distanceKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) < SAME_METRO_KM
  ) {
    return true;
  }
  return CONTINENT_OF[from.countryCode.toUpperCase()] !== "NA" && CONTINENT_OF[to.countryCode.toUpperCase()] !== "NA";
}

/** The site's figure for a cabin, by the club's rules (approved 7 Oct 2026, ADR-IMPL-037): business when positive;
 *  first only when above business; premium economy never. */
export function siteAmount(f: { business: number | null; first: number | null }, cabin: Cabin): number | null {
  if (f.business === null || !(f.business > 0)) return null;
  if (cabin === "business") return f.business;
  return f.first !== null && f.first > f.business ? f.first : null;
}

/** What a route's indicative price came to, and how. */
export type Resolution =
  | { kind: "site"; amount: number; asOf: Date; how: "stored" | "asked" }
  | { kind: "club"; amount: number; how: "fallback" | "unanswered" }
  | { kind: "none"; how: "guarded" | "none" | "cabin" | "fallback" | "unanswered" };

/**
 * The order of D6 for one route and cabin once a published fare is ruled out (the caller's): the site's stored answer,
 * then — when `live` is given (an undated search) — one live call, then the formula only when the site could not be
 * asked or, without `live`, has no stored answer. `formula` is the club's estimate for the cabin, or null.
 * - `stored`/`asked`: the site's figure. `none`: the company has no price (no number, no formula). `cabin`: the site
 *   priced the route, but not this cabin by the club's rules (first not above business) — no number either.
 * - `fallback`: the site could not be asked (`unavailable` says why). `unanswered`: no stored answer, and this caller
 *   never calls the site (Home's pins, a quote request).
 */
export async function resolveIndicative(
  q: { from: GuardAirport; to: GuardAirport; cabin: Cabin },
  deps: {
    stored: () => Promise<StoredSitePrice | null>;
    live?: () => Promise<{ row: StoredSitePrice } | { unavailable: SiteUnavailable }>;
    formula: () => number | null;
  },
): Promise<Resolution & { unavailable?: SiteUnavailable }> {
  if (routeWithoutPrice(q.from, q.to)) return { kind: "none", how: "guarded" };
  const fromRow = (row: StoredSitePrice, how: "stored" | "asked"): Resolution => {
    if (row.status === "none") return { kind: "none", how: "none" };
    const amount = siteAmount(row, q.cabin);
    return amount === null ? { kind: "none", how: "cabin" } : { kind: "site", amount, asOf: row.fetchedAt, how };
  };
  const formula = (how: "fallback" | "unanswered"): Resolution => {
    const amount = deps.formula();
    return amount === null ? { kind: "none", how } : { kind: "club", amount, how };
  };
  const stored = await deps.stored();
  if (stored) return fromRow(stored, "stored");
  if (!deps.live) return formula("unanswered");
  const live = await deps.live();
  if ("row" in live) return fromRow(live.row, "asked");
  return { ...formula("fallback"), unavailable: live.unavailable };
}
