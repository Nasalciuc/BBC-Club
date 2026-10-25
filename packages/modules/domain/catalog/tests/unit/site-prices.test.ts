/** The company's site as the price source (ADR-IMPL-063): its answers, the breaker, D6's order and the guards, the
 *  job's choice of routes. No network: the site is a fake `fetch`. Every price is made up. */
import { describe, expect, it } from "bun:test";

import { dueRoutes, type PinRoute } from "../../src/application/refresh-site-prices";
import {
  BREAKER_OPEN_MS,
  BREAKER_THRESHOLD,
  createBreaker,
  resolveIndicative,
  routeWithoutPrice,
  siteAmount,
  sitePriceClient,
  type GuardAirport,
  type StoredSitePrice,
} from "../../src/application/site-prices";
import { fakePriceSite, type FakeAnswer } from "./site-prices.fixture";

const RT = "round_trip" as const;
const UA = "BBCClub/1.0 (https://api.example.test; site prices)";
// Made-up figures.
const PRICED = { business: 2222, first: 3333, premium_economy: 1111 };

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("the site's answers", () => {
  const ask = async (answer: FakeAnswer, timeoutMs = 1_000) => {
    const site = fakePriceSite({ [`JFK-ZRH ${RT}`]: answer });
    const client = sitePriceClient({ fetch: site.fetch, userAgent: UA });
    return { answer: await client.ask({ from: "JFK", to: "ZRH", trip: RT }, { timeoutMs }), site };
  };

  it("200 with its shape: the figures, business always; the club's User-Agent and the trip asked", async () => {
    const { answer, site } = await ask(PRICED);
    expect(answer).toEqual({ kind: "priced", figures: { business: 2222, first: 3333, premiumEconomy: 1111 } });
    expect(site.calls).toEqual([`JFK-ZRH ${RT}`]);
    expect(site.agents).toEqual([UA]);
  });

  it("a figure the club does not show may be missing or odd; business may not", async () => {
    expect((await ask({ status: 200, body: JSON.stringify({ business: 2222 }) })).answer).toEqual({
      kind: "priced",
      figures: { business: 2222, first: null, premiumEconomy: null },
    });
    expect(
      (await ask({ status: 200, body: JSON.stringify({ business: 2222, first: -4, premium_economy: "x" }) })).answer,
    ).toEqual({ kind: "priced", figures: { business: 2222, first: null, premiumEconomy: null } });
    for (const body of [
      JSON.stringify({ first: 3333 }),
      JSON.stringify({ business: 0, first: 3333 }),
      JSON.stringify({ business: 2222.5 }),
      JSON.stringify({ business: "2222" }),
      JSON.stringify([2222]),
      "<html>maintenance</html>",
    ]) {
      expect((await ask({ status: 200, body })).answer).toEqual({ kind: "unavailable", reason: "invalid" });
    }
  });

  it("404 in its two bodies is the company's none; any other 404 is no answer", async () => {
    expect((await ask("no_offer")).answer).toEqual({ kind: "none", reason: "no_offer" });
    expect((await ask("unknown_airport")).answer).toEqual({ kind: "none", reason: "unknown_airport" });
    expect((await ask({ status: 404, body: "<html>Not Found</html>" })).answer).toEqual({
      kind: "unavailable",
      reason: "invalid",
    });
    expect((await ask({ status: 404, body: JSON.stringify({ error: "Something else" }) })).answer).toEqual({
      kind: "unavailable",
      reason: "invalid",
    });
  });

  it("400 is our request refused, 429 the rate limit, 5xx and a failed connection an error, silence a timeout", async () => {
    expect((await ask({ status: 400, body: '{"message":"Bad request"}' })).answer).toEqual({
      kind: "unavailable",
      reason: "bad_request",
    });
    expect((await ask({ status: 429 })).answer).toEqual({ kind: "unavailable", reason: "rate_limited" });
    expect((await ask({ status: 503 })).answer).toEqual({ kind: "unavailable", reason: "error" });
    expect((await ask("throw")).answer).toEqual({ kind: "unavailable", reason: "error" });
    expect((await ask("hang", 20)).answer).toEqual({ kind: "unavailable", reason: "timeout" });
    expect((await ask("hang-body", 20)).answer).toEqual({ kind: "unavailable", reason: "timeout" }); // headers, then silence
  });
});

describe("the breaker", () => {
  it(`opens after ${BREAKER_THRESHOLD} failures in a row, for ${BREAKER_OPEN_MS / 1000} s; then one call is let through`, () => {
    const c = clock();
    const b = createBreaker(c);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      expect(b.allow()).toBe(true);
      b.failure();
    }
    expect(b.state()).toBe("closed");
    b.success(); // a success in between: the count starts again
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      expect(b.allow()).toBe(true);
      b.failure();
    }
    expect(b.state()).toBe("open");
    expect(b.allow()).toBe(false);
    c.advance(BREAKER_OPEN_MS - 1);
    expect(b.allow()).toBe(false);
    c.advance(1);
    expect(b.state()).toBe("half_open");
    expect(b.allow()).toBe(true); // the trial
    expect(b.allow()).toBe(false); // and no other while it is out
    b.failure(); // the trial failed: open again, for the whole time
    expect(b.allow()).toBe(false);
    c.advance(BREAKER_OPEN_MS);
    expect(b.allow()).toBe(true);
    b.success();
    expect(b.state()).toBe("closed");
    expect(b.allow()).toBe(true);
  });

  it("a trial its caller abandoned (the job's time was up) lets the next one through", () => {
    const c = clock();
    const b = createBreaker(c, { threshold: 1 });
    b.failure();
    c.advance(BREAKER_OPEN_MS);
    expect(b.allow()).toBe(true);
    b.abandon();
    expect(b.allow()).toBe(true);
  });

  it("an outage costs nothing once open: the client stops asking, and a 'none' is not a failure", async () => {
    const site = fakePriceSite({ [`JFK-ZRH ${RT}`]: { status: 502 }, [`JFK-NBO ${RT}`]: "unknown_airport" });
    const c = clock();
    const client = sitePriceClient({ fetch: site.fetch, userAgent: UA, clock: c });
    for (let i = 0; i < 4; i++) await client.ask({ from: "JFK", to: "ZRH", trip: RT }, { timeoutMs: 1_000 });
    // The company's "none" is an answer: it closes the count again.
    expect(await client.ask({ from: "JFK", to: "NBO", trip: RT }, { timeoutMs: 1_000 })).toMatchObject({
      kind: "none",
    });
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      await client.ask({ from: "JFK", to: "ZRH", trip: RT }, { timeoutMs: 1_000 });
    }
    const asked = site.calls.length;
    expect(await client.ask({ from: "JFK", to: "NBO", trip: RT }, { timeoutMs: 1_000 })).toEqual({
      kind: "unavailable",
      reason: "breaker",
    });
    expect(site.calls.length).toBe(asked);
    // A call its caller stopped is not the site's failure.
    const stop = new AbortController();
    const hung = fakePriceSite({ [`JFK-ZRH ${RT}`]: "hang" });
    const other = sitePriceClient({ fetch: hung.fetch, userAgent: UA, clock: c });
    for (let i = 0; i < BREAKER_THRESHOLD + 1; i++) {
      const pending = other.ask({ from: "JFK", to: "ZRH", trip: RT }, { timeoutMs: 1_000, signal: stop.signal });
      if (i === 0) stop.abort();
      expect((await pending).kind).toBe("unavailable");
    }
    expect(other.breaker.state()).toBe("closed");
  });
});

const JFK: GuardAirport = { code: "JFK", countryCode: "US", lat: 40.64, lng: -73.78 };
const EWR: GuardAirport = { code: "EWR", countryCode: "US", lat: 40.69, lng: -74.17 };
const ZRH: GuardAirport = { code: "ZRH", countryCode: "CH", lat: 47.46, lng: 8.55 };
const LHR: GuardAirport = { code: "LHR", countryCode: "GB", lat: 51.47, lng: -0.45 };
const RMO: GuardAirport = { code: "RMO", countryCode: "MD", lat: 46.93, lng: 28.93 };

describe("what a member may see", () => {
  it("never between one airport or one metro, never where neither end is in North America", () => {
    expect(routeWithoutPrice(JFK, JFK)).toBe(true);
    expect(routeWithoutPrice(JFK, EWR)).toBe(true);
    expect(routeWithoutPrice(RMO, LHR)).toBe(true);
    expect(routeWithoutPrice(JFK, ZRH)).toBe(false);
    expect(routeWithoutPrice(RMO, JFK)).toBe(false); // Chișinău to New York: the site prices it
  });

  it("business when positive; first only above business; premium economy never", () => {
    expect(siteAmount({ business: 2222, first: 3333 }, "business")).toBe(2222);
    expect(siteAmount({ business: 2222, first: 3333 }, "first")).toBe(3333);
    expect(siteAmount({ business: 2222, first: 2222 }, "first")).toBeNull();
    expect(siteAmount({ business: 2222, first: null }, "first")).toBeNull();
    expect(siteAmount({ business: null, first: 3333 }, "first")).toBeNull();
  });
});

describe("D6's order", () => {
  const fetchedAt = new Date("2026-10-25T08:00:00Z");
  const priced: StoredSitePrice = { status: "priced", business: 2222, first: 3333, premiumEconomy: 1111, fetchedAt };
  const none: StoredSitePrice = { status: "none", business: null, first: null, premiumEconomy: null, fetchedAt };
  /** The formula's figure for the route — made up, and never the site's. */
  const FORMULA = 1633;

  const resolve = (opts: {
    stored?: StoredSitePrice | null;
    live?: { row: StoredSitePrice } | { unavailable: "timeout" | "error" | "breaker" | "invalid" | "rate_limited" };
    formula?: number | null;
    cabin?: "business" | "first";
    from?: GuardAirport;
    to?: GuardAirport;
  }) => {
    const asked: string[] = [];
    return resolveIndicative(
      { from: opts.from ?? JFK, to: opts.to ?? ZRH, cabin: opts.cabin ?? "business" },
      {
        stored: async () => {
          asked.push("stored");
          return opts.stored ?? null;
        },
        live:
          opts.live === undefined
            ? undefined
            : async () => {
                asked.push("live");
                return opts.live!;
              },
        formula: () => {
          asked.push("formula");
          return opts.formula === undefined ? FORMULA : opts.formula;
        },
      },
    ).then((r) => ({ ...r, asked }));
  };

  it("a stored answer first: the site's price, no call, no formula", async () => {
    expect(await resolve({ stored: priced, live: { unavailable: "error" } })).toEqual({
      kind: "site",
      amount: 2222,
      asOf: fetchedAt,
      how: "stored",
      asked: ["stored"],
    });
    expect(await resolve({ stored: priced, cabin: "first" })).toMatchObject({ kind: "site", amount: 3333 });
  });

  it("none stored: one live call (a search), and what it learns", async () => {
    expect(await resolve({ live: { row: priced } })).toMatchObject({ kind: "site", amount: 2222, how: "asked" });
    expect((await resolve({ live: { row: priced } })).asked).toEqual(["stored", "live"]);
  });

  it("the company has no price: no number, and never the formula — stored or just asked", async () => {
    expect(await resolve({ stored: none })).toEqual({ kind: "none", how: "none", asked: ["stored"] });
    expect(await resolve({ live: { row: none } })).toEqual({ kind: "none", how: "none", asked: ["stored", "live"] });
  });

  it("the site could not be asked: the formula — timeout, error, breaker, a body not its shape, the rate limit", async () => {
    for (const unavailable of ["timeout", "error", "breaker", "invalid", "rate_limited"] as const) {
      expect(await resolve({ live: { unavailable } })).toEqual({
        kind: "club",
        amount: FORMULA,
        how: "fallback",
        unavailable,
        asked: ["stored", "live", "formula"],
      });
    }
    // No rules loaded: nothing to fall back on.
    expect(await resolve({ live: { unavailable: "timeout" }, formula: null })).toMatchObject({
      kind: "none",
      how: "fallback",
    });
  });

  it("Home's pins and a quote never call: the stored answer, else the formula", async () => {
    expect(await resolve({ stored: priced })).toMatchObject({ kind: "site", how: "stored" });
    expect(await resolve({})).toEqual({
      kind: "club",
      amount: FORMULA,
      how: "unanswered",
      asked: ["stored", "formula"],
    });
  });

  it("first not above business on the site: no number, not the formula", async () => {
    const flat = { ...priced, first: 2222 };
    expect(await resolve({ stored: flat, cabin: "first" })).toEqual({ kind: "none", how: "cabin", asked: ["stored"] });
  });

  it("the guards come first: nothing read, nothing asked", async () => {
    for (const [from, to] of [
      [JFK, JFK],
      [JFK, EWR],
      [RMO, LHR],
    ] as const) {
      expect(await resolve({ from, to, stored: priced, live: { row: priced } })).toEqual({
        kind: "none",
        how: "guarded",
        asked: [],
      });
    }
  });
});

describe("the job's routes", () => {
  const at = (code: string, countryCode = "US", lat = 40, lng = -74): GuardAirport => ({ code, countryCode, lat, lng });
  const route = (from: string, to: GuardAirport): PinRoute => ({ from: at(from), to });
  const LHR_ = at("LHR", "GB", 51.47, -0.45);
  const CDG = at("CDG", "FR", 49.0, 2.55);
  const NRT = at("NRT", "JP", 35.77, 140.39);
  const HND = at("HND", "JP", 35.55, 139.78);
  const routes = [route("JFK", LHR_), route("JFK", CDG), route("JFK", LHR_), route("JFK", NRT), route("MIA", HND)];

  it("no stored answer first, in the pins' order; then the due, soonest to expire first; never a fresh one", () => {
    const stored = new Map([
      ["JFK-CDG", { expiresAt: new Date(5_000), due: true }],
      ["JFK-NRT", { expiresAt: new Date(4_000), due: true }],
      ["MIA-HND", { expiresAt: new Date(9_000), due: false }],
    ]);
    expect(dueRoutes(routes, stored).map((r) => `${r.from.code}-${r.to.code}`)).toEqual([
      "JFK-LHR",
      "JFK-NRT",
      "JFK-CDG",
    ]);
  });

  it("each home's first candidates only, as its pins read them; within the budget", () => {
    // Rows for JFK: LHR, CDG, LHR again (two cities on one airport), NRT; with three a home, NRT is not a candidate.
    expect(dueRoutes(routes, new Map(), { perHome: 3 }).map((r) => `${r.from.code}-${r.to.code}`)).toEqual([
      "JFK-LHR",
      "JFK-CDG",
      "MIA-HND",
    ]);
    expect(dueRoutes(routes, new Map(), { budget: 2 })).toHaveLength(2);
  });

  it("never a route the club does not price", () => {
    const odd = [route("JFK", at("JFK")), route("JFK", at("EWR", "US", 40.69, -74.17)), route("JFK", LHR_)];
    expect(dueRoutes(odd, new Map()).map((r) => r.to.code)).toEqual(["LHR"]);
  });
});
