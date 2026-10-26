/** The company's site as the price source against the database (ADR-IMPL-063): the stored answers, the quote's and the
 *  pins' reads (never a call), the refresh job. The site is a fake `fetch`; every price is made up. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import { sitePricesRepo } from "../../src/infrastructure/site-prices.repo";
import { catalogModule } from "../../src/module";
import { storedPricingRules } from "../../src/pricing/rules";
import { FIXTURE_RULES } from "../unit/pricing-rules.fixture";
import { fakeClock } from "../unit/site.fixture";
import { fakePriceSite, type FakeAnswer } from "../unit/site-prices.fixture";

const RT = "round_trip" as const;
/** The formula's figures for JFK → ZRH with the made-up FIXTURE_RULES (catalog.test.ts). */
const FORMULA_ZRH = { business: 1633, first: 1776 };

async function setup(name: string, routes: Record<string, FakeAnswer> = {}) {
  const iso = await isolatedDb(name);
  const site = fakePriceSite(routes);
  const clock = fakeClock();
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({ fetch: site.fetch, siteClock: clock }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  const job = out.jobs?.find((j) => j.name === "refresh-site-prices");
  if (!job) throw new Error("refresh-site-prices missing");
  const rows = async () =>
    (
      (await iso.db.execute(sql`
        SELECT route_from, route_to, trip, status, business, first, premium_economy,
          extract(epoch FROM expires_at - fetched_at)::int AS ttl
        FROM catalog.site_prices ORDER BY route_from, route_to`)) as unknown as {
        route_from: string;
        route_to: string;
        trip: string;
        status: string;
        business: number | null;
        first: number | null;
        premium_economy: number | null;
        ttl: number;
      }[]
    ).map((r) => ({ ...r, route_from: r.route_from.trim(), route_to: r.route_to.trim() }));
  return {
    iso,
    site,
    clock,
    flags: platform.flags,
    facade: out.exposes!,
    rows,
    run: () => job.spec.handler({ signal: new AbortController().signal } as never) as Promise<Record<string, number>>,
    estimatesOn: async (siteOn: boolean) => {
      await platform.flags.set("catalog.estimates", { enabled: true });
      await platform.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
      await platform.flags.set("catalog.site_prices", { enabled: siteOn });
    },
    /** The site's cities as a night's sync leaves them: Zurich, Paris and Tokyo listed from JFK, Tokyo from MIA. */
    seedSiteRoutes: () =>
      iso.db.execute(sql`
        WITH places AS (
          INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted) VALUES
            (101, 'Zurich', 'Switzerland', 'Europe', 'ZRH', ARRAY['ZRH'], true),
            (102, 'Paris', 'France', 'Europe', 'CDG', ARRAY['CDG', 'ORY'], false),
            (103, 'Tokyo', 'Japan', 'Asia', 'HND', ARRAY['HND', 'NRT'], false)
          RETURNING cms_id)
        INSERT INTO catalog.site_routes (route_from, cms_id, deal, price) VALUES
          ('JFK', 101, 1, 1000), ('JFK', 102, 2, 1000), ('JFK', 103, 3, 1000), ('MIA', 103, 4, 1000)`),
  };
}

describe("site prices — the stored answers", () => {
  it("stored once per route and trip, replaced by a newer answer, shown for 24 hours; the CHECK refuses 25", async () => {
    const t = await setup("site-prices-store");
    const q = { from: "JFK", to: "ZRH", trip: RT };
    const first = { business: 2222, first: 3333, premiumEconomy: 1111 };
    await sitePricesRepo.store(t.iso.db, q, { kind: "priced", figures: first });
    await sitePricesRepo.store(t.iso.db, q, { kind: "priced", figures: first }); // twice: one row
    expect(await t.rows()).toEqual([
      {
        route_from: "JFK",
        route_to: "ZRH",
        trip: RT,
        status: "priced",
        business: 2222,
        first: 3333,
        premium_economy: 1111,
        ttl: 86_400,
      },
    ]);
    // The company's answer changes: the route's row says what it says now.
    await sitePricesRepo.store(t.iso.db, q, { kind: "none" });
    expect(await t.rows()).toMatchObject([{ status: "none", business: null, first: null, premium_economy: null }]);
    expect(await sitePricesRepo.fresh(t.iso.db, "jfk", "zrh", RT)).toMatchObject({ status: "none" });
    expect(await sitePricesRepo.fresh(t.iso.db, "JFK", "ZRH", "one_way")).toBeNull();

    // D6 in the table: an answer may not be shown for longer than 24 hours.
    const insert = (hours: number) =>
      t.iso.db
        .execute(
          sql`
          INSERT INTO catalog.site_prices (route_from, route_to, trip, status, business, fetched_at, expires_at)
          VALUES ('JFK', 'CDG', 'round_trip', 'priced', 2100, now(), now() + make_interval(hours => ${hours}))`,
        )
        .then(
          () => "ok",
          (err: { code?: string; cause?: { code?: string } }) => err.code ?? err.cause?.code ?? "error",
        );
    expect(await insert(25)).toBe("23514");
    expect(await insert(24)).toBe("ok");

    // An answer past its expiry is never read, and the job's purge deletes it.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
      WHERE route_to = 'CDG'`);
    expect(await sitePricesRepo.fresh(t.iso.db, "JFK", "CDG", RT)).toBeNull();
    expect((await sitePricesRepo.freshFrom(t.iso.db, "JFK", ["CDG", "ZRH"], RT)).size).toBe(1);
    expect(await sitePricesRepo.purgeExpired(t.iso.db)).toBe(1);

    // Home keeps its pins a minute: an answer that would pass its 24 hours within that minute is not read for them.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '23 hours 59 minutes 30 seconds',
        expires_at = now() + interval '30 seconds'
      WHERE route_to = 'ZRH'`);
    expect((await sitePricesRepo.freshFrom(t.iso.db, "JFK", ["ZRH"], RT)).size).toBe(1);
    expect((await sitePricesRepo.freshFrom(t.iso.db, "JFK", ["ZRH"], RT, 60)).size).toBe(0);
    await t.iso.drop();
  });
});

describe("site prices — a quote and Home's pins read, never ask", () => {
  it("with the site's prices off, both are exactly as before: the formula, no source, no question to the site", async () => {
    const t = await setup("site-prices-off", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1 },
    });
    await t.seedSiteRoutes();
    await t.estimatesOn(false);
    await t.flags.set("catalog.site_pins", { enabled: true });
    // Even a stored answer is not read while the flag is off.
    await sitePricesRepo.store(t.iso.db, { from: "JFK", to: "ZRH", trip: RT }, { kind: "none" });
    expect(await t.facade.indicativeFor(undefined, { from: "JFK", to: "ZRH", cabin: "business" })).toEqual({
      amount: FORMULA_ZRH.business,
      currency: "USD",
      trip: RT,
      cabin: "business",
      basis: "formula",
      rules: storedPricingRules(FIXTURE_RULES).fingerprint,
    });
    const pins = await t.facade.destinations(undefined, "JFK");
    expect(pins.find((p) => p.code === "ZRH")).toMatchObject({ fromPrice: FORMULA_ZRH.business });
    for (const p of pins) expect(p).not.toHaveProperty("priceSource");
    expect(await t.run()).toEqual({ skipped: 1, purged: 0 });
    expect(t.site.calls).toEqual([]);
    await t.iso.drop();
  });

  it("with them on: the site's stored answer, else the formula; none where the company has none — never a call", async () => {
    const t = await setup("site-prices-read");
    await t.seedSiteRoutes();
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    const ask = (to: string, cabin: "business" | "first" = "business") =>
      t.facade.indicativeFor(undefined, { from: "JFK", to, cabin });

    // Nothing stored yet: the formula, said to be the club's, with its rules.
    expect(await ask("ZRH")).toMatchObject({
      amount: FORMULA_ZRH.business,
      source: "club",
      rules: storedPricingRules(FIXTURE_RULES).fingerprint,
    });

    // The site's answer stored (as a search or the job leaves it): its figure, when it answered, and no rules.
    await sitePricesRepo.store(
      t.iso.db,
      { from: "JFK", to: "ZRH", trip: RT },
      { kind: "priced", figures: { business: 2222, first: 3333, premiumEconomy: 1111 } },
    );
    const zurich = await ask("ZRH");
    expect(zurich).toMatchObject({ amount: 2222, source: "site", basis: "formula", trip: RT });
    expect(zurich).not.toHaveProperty("rules");
    expect(Date.now() - Date.parse(zurich!.asOf!)).toBeLessThan(60_000);
    expect(await ask("ZRH", "first")).toMatchObject({ amount: 3333, source: "site" });

    // The company has no price for Paris: no number at all — not the formula.
    await sitePricesRepo.store(t.iso.db, { from: "JFK", to: "CDG", trip: RT }, { kind: "none" });
    expect(await ask("CDG")).toBeNull();

    // Home's pins: the same numbers, each saying who priced it; Paris gets no pin; Tokyo (nothing stored) the formula.
    const pins = await t.facade.destinations(undefined, "JFK");
    expect(pins.find((p) => p.code === "ZRH")).toMatchObject({ fromPrice: 2222, priceSource: "site" });
    expect(pins.find((p) => p.code === "CDG")).toBeUndefined();
    expect(pins.find((p) => p.code === "HND")).toMatchObject({ priceSource: "club" });

    // Never a question to the site from either.
    expect(t.site.calls).toEqual([]);
    await t.iso.drop();
  });

  it("Home keeps its pins a minute: an answer that passes its 24 hours within it is not shown on them", async () => {
    const t = await setup("site-prices-pins-minute");
    await t.seedSiteRoutes();
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    for (const [to, business] of [
      ["ZRH", 2222],
      ["HND", 2400],
    ] as const) {
      await sitePricesRepo.store(
        t.iso.db,
        { from: "JFK", to, trip: RT },
        { kind: "priced", figures: { business, first: business + 1000, premiumEconomy: null } },
      );
    }
    // Zurich's answer has 30 seconds left of its day: cached for a minute, its pin would show it past 24 hours.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '23 hours 59 minutes 30 seconds',
        expires_at = now() + interval '30 seconds'
      WHERE route_to = 'ZRH'`);
    const pins = await t.facade.destinations(undefined, "JFK");
    expect(pins.find((p) => p.code === "ZRH")).toMatchObject({ fromPrice: FORMULA_ZRH.business, priceSource: "club" });
    expect(pins.find((p) => p.code === "HND")).toMatchObject({ fromPrice: 2400, priceSource: "site" });
    expect(t.site.calls).toEqual([]);
    await t.iso.drop();
  });
});

describe("site prices — the refresh job", () => {
  it("asks for the pins' routes once, about two a second; a route it stored is not asked again until it is due", async () => {
    const t = await setup("site-prices-job", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
      [`JFK-CDG ${RT}`]: { business: 2100, first: 3100, premium_economy: 1000 },
      [`JFK-HND ${RT}`]: "unknown_airport",
      [`MIA-HND ${RT}`]: { business: 2400, first: 3600, premium_economy: 1200 },
    });
    await t.seedSiteRoutes();
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });

    const first = await t.run();
    expect(first).toMatchObject({ due: 4, asked: 4, priced: 3, none: 1, failed: 0, rateLimited: 0, breakerOpen: 0 });
    expect(t.site.calls.sort()).toEqual([`JFK-CDG ${RT}`, `JFK-HND ${RT}`, `JFK-ZRH ${RT}`, `MIA-HND ${RT}`]);
    expect(new Set(t.site.agents)).toEqual(new Set(["BBCClub/1.0 (https://api.example.test; site prices)"]));
    // One question starting every 500 ms: about two a second (the fake clock answers at once, so each wait is whole).
    expect(t.clock.slept).toEqual([500, 500, 500]);
    const after = await t.rows();
    expect(after.map((r) => `${r.route_from}-${r.route_to} ${r.status}`)).toEqual([
      "JFK-CDG priced",
      "JFK-HND none",
      "JFK-ZRH priced",
      "MIA-HND priced",
    ]);

    const second = await t.run();
    expect(second).toMatchObject({ due: 0, asked: 0 });
    expect(t.site.calls).toHaveLength(4);
    expect(await t.rows()).toEqual(after);

    // Answered 19 hours ago: due again, and asked again; a fresh one is not.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '19 hours', expires_at = now() + interval '5 hours'
      WHERE route_to = 'ZRH'`);
    expect(await t.run()).toMatchObject({ due: 1, asked: 1, priced: 1 });
    expect(t.site.calls.at(-1)).toBe(`JFK-ZRH ${RT}`);
    await t.iso.drop();
  });

  it("stops at the site's first 429, stores nothing for it, and keeps what it had", async () => {
    const t = await setup("site-prices-429", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
      [`JFK-CDG ${RT}`]: { status: 429 },
      [`JFK-HND ${RT}`]: { business: 2500, first: 3700, premium_economy: 1300 },
      [`MIA-HND ${RT}`]: { business: 2400, first: 3600, premium_economy: 1200 },
    });
    await t.seedSiteRoutes();
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    const report = await t.run();
    // The pins' order from JFK: Zurich (the site's home page), then by traffic; the run stops at the 429.
    expect(report).toMatchObject({ rateLimited: 1, failed: 1 });
    expect(report.asked).toBe(t.site.calls.length);
    expect(t.site.calls).toContain(`JFK-CDG ${RT}`);
    expect(t.site.calls.at(-1)).toBe(`JFK-CDG ${RT}`);
    expect((await t.rows()).map((r) => r.route_to)).not.toContain("CDG");
    await t.iso.drop();
  });

  it("an outage opens the breaker and the run stops; while it is open nothing is asked", async () => {
    const t = await setup("site-prices-outage");
    // Six US homes to six cities: 36 routes, every answer a 503.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted) VALUES
        (201, 'Zurich', 'Switzerland', 'Europe', 'ZRH', ARRAY['ZRH'], false),
        (202, 'Paris', 'France', 'Europe', 'CDG', ARRAY['CDG'], false),
        (203, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'], false),
        (204, 'Rome', 'Italy', 'Europe', 'FCO', ARRAY['FCO'], false),
        (205, 'Madrid', 'Spain', 'Europe', 'MAD', ARRAY['MAD'], false),
        (206, 'Tokyo', 'Japan', 'Asia', 'HND', ARRAY['HND'], false)`);
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price)
      SELECT home, cms_id, row_number() OVER (), 1000
      FROM unnest(ARRAY['JFK', 'MIA', 'ORD', 'LAX', 'SFO', 'BOS']) AS home, generate_series(201, 206) AS cms_id`);
    for (const home of ["JFK", "MIA", "ORD", "LAX", "SFO", "BOS"]) {
      for (const to of ["ZRH", "CDG", "LHR", "FCO", "MAD", "HND"])
        t.site.routes[`${home}-${to} ${RT}`] = { status: 503 };
    }
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    const report = await t.run();
    expect(report).toMatchObject({ due: 36, asked: 5, failed: 5, breakerOpen: 1 });
    expect(await t.run()).toMatchObject({ asked: 0, breakerOpen: 1 });
    expect(t.site.calls).toHaveLength(5);
    expect(await t.rows()).toEqual([]);
    await t.iso.drop();
  });

  it("a route the site keeps failing waits an hour, then goes last: it never holds back the routes after it", async () => {
    const t = await setup("site-prices-job-backoff");
    // From JFK, eight cities: the five the site's home page promotes come first in the pins' order and answer 503 every
    // time; the three after them are priced (made-up figures).
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted) VALUES
        (301, 'Zurich', 'Switzerland', 'Europe', 'ZRH', ARRAY['ZRH'], true),
        (302, 'Paris', 'France', 'Europe', 'CDG', ARRAY['CDG'], true),
        (303, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'], true),
        (304, 'Rome', 'Italy', 'Europe', 'FCO', ARRAY['FCO'], true),
        (305, 'Madrid', 'Spain', 'Europe', 'MAD', ARRAY['MAD'], true),
        (306, 'Athens', 'Greece', 'Europe', 'ATH', ARRAY['ATH'], false),
        (307, 'Lisbon', 'Portugal', 'Europe', 'LIS', ARRAY['LIS'], false),
        (308, 'Amsterdam', 'Netherlands', 'Europe', 'AMS', ARRAY['AMS'], false)`);
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price)
      SELECT 'JFK', cms_id, cms_id, 1000 FROM generate_series(301, 308) AS cms_id`);
    const failing = ["ZRH", "CDG", "LHR", "FCO", "MAD"];
    for (const to of failing) t.site.routes[`JFK-${to} ${RT}`] = { status: 503 };
    t.site.routes[`JFK-ATH ${RT}`] = { business: 2444, first: 3555, premium_economy: 1222 };
    t.site.routes[`JFK-LIS ${RT}`] = { business: 2333, first: 3444, premium_economy: 1111 };
    t.site.routes[`JFK-AMS ${RT}`] = { business: 2111, first: 3222, premium_economy: 1000 };
    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    const later = (ms: number) => t.clock.sleep(ms, new AbortController().signal);

    // The five failures in a row open the breaker: the run stops before the routes after them.
    expect(await t.run()).toMatchObject({ due: 8, asked: 5, failed: 5, breakerOpen: 1, backingOff: 0 });
    expect(t.site.calls.map((c) => c.slice(4, 7)).sort()).toEqual([...failing].sort());

    // Ten minutes on, the breaker lets one question through: the five wait their hour, so it is Athens', which closes
    // the breaker, and the routes after it are asked and stored.
    await later(10 * 60_000);
    expect(await t.run()).toMatchObject({ due: 3, asked: 3, priced: 3, failed: 0, breakerOpen: 0, backingOff: 5 });
    expect((await t.rows()).map((r) => `${r.route_to} ${r.status}`)).toEqual([
      "AMS priced",
      "ATH priced",
      "LIS priced",
    ]);

    // An hour after they failed, the five are asked again — after every other route due (none is), oldest failure first.
    await later(60 * 60_000);
    const asked = t.site.calls.length;
    expect(await t.run()).toMatchObject({ due: 5, asked: 5, failed: 5, backingOff: 0 });
    expect(t.site.calls.slice(asked).map((c) => c.slice(4, 7))).toEqual(
      t.site.calls.slice(0, 5).map((c) => c.slice(4, 7)),
    );
    await t.iso.drop();
  });

  it("asks nothing for a route past its day (ADR-IMPL-067): a city the site has not listed for a day is no pin", async () => {
    const t = await setup("site-prices-job-expired-route", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
      [`JFK-CDG ${RT}`]: { business: 2100, first: 3100, premium_economy: 1000 },
      [`JFK-HND ${RT}`]: { business: 2500, first: 3700, premium_economy: 1300 },
      [`MIA-HND ${RT}`]: { business: 2400, first: 3600, premium_economy: 1200 },
    });
    await t.seedSiteRoutes();
    // JFK → Tokyo, read a day and an hour ago: past its day. Miami's Tokyo is still within its own.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes SET synced_at = now() - interval '25 hours', valid_until = now() - interval '1 hour'
      WHERE route_from = 'JFK' AND cms_id = 103`);
    const routes = (await sitePricesRepo.pinRoutes(t.iso.db)).map((r) => `${r.from.code}-${r.to.code}`);
    expect(routes.sort()).toEqual(["JFK-CDG", "JFK-ZRH", "MIA-HND"]);

    await t.estimatesOn(true);
    await t.flags.set("catalog.site_pins", { enabled: true });
    expect(await t.run()).toMatchObject({ due: 3, asked: 3, priced: 3 });
    expect(t.site.calls.sort()).toEqual([`JFK-CDG ${RT}`, `JFK-ZRH ${RT}`, `MIA-HND ${RT}`]);
    await t.iso.drop();
  });

  it("asks nothing without Home's site pins: the routes it keeps are theirs, and no member sees them", async () => {
    const t = await setup("site-prices-job-no-pins", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
    });
    await t.seedSiteRoutes();
    await t.estimatesOn(true);
    expect(await t.run()).toEqual({ skipped: 1, purged: 0 });
    expect(t.site.calls).toEqual([]);
    expect(await t.rows()).toEqual([]);
    await t.iso.drop();
  });

  for (const flag of ["catalog.site_prices", "catalog.site_pins", "catalog.estimates"]) {
    it(`${flag} turned off during a run stops it before its next question`, async () => {
      const t = await setup(`site-prices-job-off-${flag.slice(8)}`, {
        [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
        [`JFK-CDG ${RT}`]: { business: 2100, first: 3100, premium_economy: 1000 },
        [`JFK-HND ${RT}`]: { business: 2500, first: 3700, premium_economy: 1300 },
        [`MIA-HND ${RT}`]: { business: 2400, first: 3600, premium_economy: 1200 },
      });
      await t.seedSiteRoutes();
      await t.estimatesOn(true);
      await t.flags.set("catalog.site_pins", { enabled: true });
      // The operator switches it off while the second question is out.
      t.site.onCall = async () => {
        if (t.site.calls.length === 2) await t.flags.set(flag, { enabled: false });
      };
      const report = await t.run();
      expect(report).toMatchObject({ due: 4, asked: 2, priced: 2, stopped: 1 });
      expect(t.site.calls).toHaveLength(2);
      // What it learned before the switch is kept: answers, not errors.
      expect(await t.rows()).toHaveLength(2);
      await t.iso.drop();
    });
  }

  it("deletes expired answers with the site's prices off: nothing kept past its day once the feature is off", async () => {
    const t = await setup("site-prices-job-purge-off");
    await t.estimatesOn(true);
    await sitePricesRepo.store(
      t.iso.db,
      { from: "JFK", to: "ZRH", trip: RT },
      { kind: "priced", figures: { business: 2222, first: 3333, premiumEconomy: 1111 } },
    );
    await sitePricesRepo.store(t.iso.db, { from: "JFK", to: "CDG", trip: RT }, { kind: "none" });
    await t.flags.set("catalog.site_prices", { enabled: false });
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
      WHERE route_to = 'ZRH'`);
    expect(await t.run()).toEqual({ skipped: 1, purged: 1 });
    expect((await t.rows()).map((r) => r.route_to)).toEqual(["CDG"]);
    // Estimates off as well (the master switch): the same.
    await t.flags.set("catalog.estimates", { enabled: false });
    await t.iso.db.execute(sql`
      UPDATE catalog.site_prices SET fetched_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'`);
    expect(await t.run()).toEqual({ skipped: 1, purged: 1 });
    expect(await t.rows()).toEqual([]);
    expect(t.site.calls).toEqual([]);
    await t.iso.drop();
  });
});
