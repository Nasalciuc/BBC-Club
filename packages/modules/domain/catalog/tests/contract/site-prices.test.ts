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
    expect(await t.run()).toEqual({ skipped: 1 });
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
});

describe("site prices — the refresh job", () => {
  it("asks for the pins' routes once, about two a second; run twice, the same rows and no second question", async () => {
    const t = await setup("site-prices-job", {
      [`JFK-ZRH ${RT}`]: { business: 2222, first: 3333, premium_economy: 1111 },
      [`JFK-CDG ${RT}`]: { business: 2100, first: 3100, premium_economy: 1000 },
      [`JFK-HND ${RT}`]: "unknown_airport",
      [`MIA-HND ${RT}`]: { business: 2400, first: 3600, premium_economy: 1200 },
    });
    await t.seedSiteRoutes();
    await t.estimatesOn(true);

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
    const report = await t.run();
    expect(report).toMatchObject({ due: 36, asked: 5, failed: 5, breakerOpen: 1 });
    expect(await t.run()).toMatchObject({ asked: 0, breakerOpen: 1 });
    expect(t.site.calls).toHaveLength(5);
    expect(await t.rows()).toEqual([]);
    await t.iso.drop();
  });
});
