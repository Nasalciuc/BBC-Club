/**
 * The company site's deals for Home (ADR-IMPL-067) against the database: a recorded read of the site (its 154 cities,
 * made-up prices) through the sync job, then `siteDeals` — from home and its metro, else the nearest city the site
 * sells from; one deal per city; a source, an origin and a day of validity on each; nothing once expired, dropped or
 * switched off.
 */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import { SiteDealVM } from "@bbc/shared/api/v1/fares";
import type { SiteDeal } from "../../src/api";
import { catalogModule } from "../../src/module";
import { fakeClock, fakeSiteFetch, type FakeSite } from "../unit/site.fixture";
import { madeUpPrice, recordedSite } from "../unit/site-recorded.fixture";

const DAY = 86_400_000;

async function setup(name: string, site: FakeSite = recordedSite()) {
  const iso = await isolatedDb(name);
  const calls: string[] = [];
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({
    fetch: (url, init) => fakeSiteFetch(site, calls)(url, init),
    siteClock: fakeClock(),
  }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  const job = out.jobs?.find((j) => j.name === "sync-site-destinations");
  if (!job) throw new Error("sync-site-destinations missing");
  const facade = out.exposes!;
  return {
    iso,
    site,
    calls,
    flags: platform.flags,
    /** The deals read now, past the minute's cache — what a member sees once the cache turns. */
    deals: (home: string, limit = 24) => facade.siteDeals(iso.db, home, limit),
    /** Through the cache, as Home asks. */
    cached: (home: string, limit = 24) => facade.siteDeals(undefined, home, limit),
    run: () => job.spec.handler({ signal: new AbortController().signal } as never) as Promise<Record<string, number>>,
  };
}

/** A deal as the floor of the pre-registered check reads it: a source, an origin, a validity. */
function expectSourced(deal: SiteDeal, at: number) {
  expect(SiteDealVM.safeParse(deal).success).toBe(true);
  expect(deal.id).toMatch(/^site-\d+-[A-Z]{3}$/);
  expect(deal.price).toEqual({ amount: expect.any(Number), currency: "USD", basis: "site", from: true });
  const dealId = Number(deal.id.split("-")[1]);
  expect(deal.price.amount).toBe(madeUpPrice(dealId)); // the site's "Price Today", as the read gave it
  expect(deal.origin.code).toMatch(/^[A-Z]{3}$/);
  expect(deal.origin.city.length).toBeGreaterThan(0);
  const until = Date.parse(deal.validUntil);
  expect(until).toBeGreaterThan(at);
  expect(until).toBeLessThanOrEqual(at + DAY + 60_000);
  // The site's "Old Price" has no source: never served, under any name.
  expect(keysOf(deal).filter((k) => /published|old|save|reference|discount/i.test(k))).toEqual([]);
}

/** Every key of a JSON value, nested ones included. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  }
  return [];
}

/** No destination city twice for one origin, and (stricter) none twice at all. */
function expectOnceEach(deals: readonly SiteDeal[]) {
  const cities = deals.map((d) => d.destination.code);
  expect(new Set(cities).size).toBe(cities.length);
  const airports = deals.flatMap((d) => d.airports);
  expect(new Set(airports).size).toBe(airports.length);
}

describe("site deals — the recorded read", () => {
  it("a New York home: its own deals, from home, at least 12 — every one sourced, origined and valid for a day", async () => {
    const t = await setup("deals-new-york");
    await t.flags.set("catalog.site_offers", { enabled: true });
    expect(await t.run()).toMatchObject({ read: 1, cities: 154, places: 153, routes: 1439 });
    const at = Date.now();

    const all = await t.deals("JFK", 500);
    expect(all.length).toBe(153); // every city the site places, Kyoto (no airport) aside
    expectOnceEach(all);
    for (const d of all) {
      expectSourced(d, at);
      expect(d.origin).toEqual({ code: "JFK", city: "New York" });
    }
    // In the pins' order: the site's home page first (Tokyo is on it), then the busiest destinations.
    const promoted = new Set(["AMS", "SIN", "SYD", "HND", "VIE"]);
    expect(all.slice(0, 5).every((d) => promoted.has(d.destination.code))).toBe(true);

    const shown = await t.cached("JFK", 24);
    expect(shown.length).toBe(24);
    expect(shown.map((d) => d.id)).toEqual(all.slice(0, 24).map((d) => d.id));

    // Newark is New York too: the same cities, from its own airport — no origin to name.
    const ewr = await t.deals("EWR", 500);
    expect(ewr.length).toBe(153);
    expect(new Set(ewr.map((d) => d.origin.code))).toEqual(new Set(["EWR"]));
    await t.iso.drop();
  }, 60_000);

  it("a home the site sells nothing from: the nearest city it sells from, named on every deal", async () => {
    const t = await setup("deals-nearest");
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.run();
    const at = Date.now();

    // Seattle: San Francisco is the nearest (about 1,090 km), and has 99 deals.
    const seattle = await t.deals("SEA");
    expect(seattle.length).toBe(24);
    expectOnceEach(seattle);
    for (const d of seattle) {
      expectSourced(d, at);
      expect(d.origin).toEqual({ code: "SFO", city: "San Francisco" });
    }

    // Toronto: Washington — Baltimore is 557 km away, Philadelphia 558 — its 97 deals, named from the metro's first
    // airport.
    const toronto = await t.deals("YYZ");
    expect(toronto.length).toBe(24);
    expectOnceEach(toronto);
    for (const d of toronto) expect(d.origin).toEqual({ code: "IAD", city: "Washington" });

    // Chișinău: Boston's five deals, then New York's — the nearest US cities, in turn.
    const chisinau = await t.deals("RMO");
    expect(chisinau.length).toBe(24);
    expectOnceEach(chisinau);
    expect(chisinau.slice(0, 5).every((d) => d.origin.city === "Boston")).toBe(true);
    expect(chisinau.slice(5).every((d) => d.origin.city === "New York")).toBe(true);

    // Boston itself: its own five first, then New York's for the cities Boston does not list.
    const boston = await t.deals("BOS");
    expect(boston.slice(0, 5).map((d) => d.origin.code)).toEqual(["BOS", "BOS", "BOS", "BOS", "BOS"]);
    expect(boston.slice(5).every((d) => d.origin.city === "New York")).toBe(true);
    expectOnceEach(boston);

    // A home the catalog does not know: nothing.
    expect(await t.deals("QQQ")).toEqual([]);
    await t.iso.drop();
  }, 60_000);
});

describe("site deals — further metros", () => {
  it("when the nearest metros list the same cities, the next metros are read until the limit is met", async () => {
    const t = await setup("deals-second-round");
    await t.flags.set("catalog.site_offers", { enabled: true });
    // A snapshot of its own (made-up prices): Boston and New York list the same five cities; Washington five others;
    // Chicago five more.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted)
      SELECT 8000 + x.ord, a.city, a.country, 'Europe', a.code, ARRAY[a.code], false
      FROM unnest(string_to_array('LHR,CDG,FCO,MAD,AMS,ZRH,VIE,PRG,BER,CPH,ATH,LIS,DUB,OSL,ARN', ','))
        WITH ORDINALITY AS x(code, ord)
      JOIN catalog.airports a ON a.code = x.code`);
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price)
      SELECT o.origin, p.cms_id, p.cms_id * 10 + o.n, 1001
      FROM catalog.site_places p
      JOIN (VALUES ('BOS', 1, 8001, 8005), ('JFK', 2, 8001, 8005), ('IAD', 3, 8006, 8010), ('ORD', 4, 8011, 8015))
        AS o(origin, n, lo, hi) ON p.cms_id BETWEEN o.lo AND o.hi`);
    const washington = ["ZRH", "VIE", "PRG", "BER", "CPH"];

    // Providence, eight: Boston (about 70 km) and New York (about 250) hold ten deals between them, so they are read
    // first — but only five cities. Washington is read next for the three still missing; Chicago never.
    const deals = await t.deals("PVD", 8);
    expect(deals).toHaveLength(8);
    expectOnceEach(deals);
    expect(deals.map((d) => d.origin.city)).toEqual([
      ...Array<string>(5).fill("Boston"),
      ...Array<string>(3).fill("Washington"),
    ]);
    expect(new Set(deals.slice(0, 5).map((d) => d.destination.code))).toEqual(
      new Set(["LHR", "CDG", "FCO", "MAD", "AMS"]),
    );
    expect(deals.slice(5).every((d) => washington.includes(d.destination.code))).toBe(true);

    // Twelve: Washington's five are not enough either, so Chicago is read for the last two.
    const twelve = await t.deals("PVD", 12);
    expect(twelve.map((d) => d.origin.city)).toEqual([
      ...Array<string>(5).fill("Boston"),
      ...Array<string>(5).fill("Washington"),
      ...Array<string>(2).fill("Chicago"),
    ]);
    expectOnceEach(twelve);
    await t.iso.drop();
  }, 60_000);
});

describe("site deals — a day at most (D6)", () => {
  it("an expired deal is not served; a deal the site drops is gone at the next sync", async () => {
    const t = await setup("deals-expiry");
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.run();
    const london = (deals: readonly SiteDeal[]) => deals.find((d) => d.destination.code === "LHR");
    expect(london(await t.deals("JFK", 500))?.origin.code).toBe("JFK");

    // The JFK row read a day and a minute ago: past its day, not served — London comes from Newark, New York still.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes SET synced_at = now() - interval '1441 minutes', valid_until = now() - interval '1 minute'
      WHERE route_from = 'JFK' AND cms_id = 23`);
    expect(london(await t.deals("JFK", 500))?.origin).toEqual({ code: "EWR", city: "New York" });
    // In its last 30 seconds: a read now still serves it; Home's read, kept a minute, does not.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes
      SET synced_at = now() - interval '1439 minutes 30 seconds', valid_until = now() + interval '30 seconds'
      WHERE route_from = 'JFK' AND cms_id = 23`);
    expect(london(await t.deals("JFK", 500))?.origin.code).toBe("JFK");
    expect(london(await t.cached("JFK", 500))?.origin.code).toBe("EWR");
    // In its last 70 seconds: still none through Home's read — Redis keeps it up to 66 s (a minute and 10 %).
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes
      SET synced_at = now() - interval '1438 minutes 50 seconds', valid_until = now() + interval '70 seconds'
      WHERE route_from = 'JFK' AND cms_id = 23`);
    expect(london(await t.deals("JFK", 500))?.origin.code).toBe("JFK");
    expect(london(await t.cached("JFK", 400))?.origin.code).toBe("EWR");
    // In its last 100 seconds: none either — Home's 304 can serve a body for the minute after the memo's minute, so a
    // read kept a minute asks for 141 s.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes
      SET synced_at = now() - interval '1438 minutes 20 seconds', valid_until = now() + interval '100 seconds'
      WHERE route_from = 'JFK' AND cms_id = 23`);
    expect(london(await t.deals("JFK", 500))?.origin.code).toBe("JFK");
    expect(london(await t.cached("JFK", 300))?.origin.code).toBe("EWR");
    // Past that margin, Home's read serves it again.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes
      SET synced_at = now() - interval '1436 minutes 40 seconds', valid_until = now() + interval '200 seconds'
      WHERE route_from = 'JFK' AND cms_id = 23`);
    expect(london(await t.cached("JFK", 200))?.origin.code).toBe("JFK");

    // The site drops London's New York deal: the next sync takes it away, from all three New York airports.
    for (const region of t.site.regions)
      for (const country of region.countries)
        for (const city of country.cities)
          if (city.id === 23) city.deals = city.deals.filter((d) => d.name.trim() !== "New York");
    await t.run();
    const after = await t.deals("JFK", 500);
    expect(after.some((d) => d.destination.code === "LHR" && d.origin.city === "New York")).toBe(false);
    const rows = (await t.iso.db.execute(sql`
      SELECT route_from FROM catalog.site_routes WHERE cms_id = 23 AND route_from IN ('JFK', 'EWR', 'LGA')`)) as unknown[];
    expect(rows).toEqual([]);
    await t.iso.drop();
  }, 60_000);

  it("a sync that fails changes nothing: the deals it leaves expire within the day", async () => {
    const t = await setup("deals-failed");
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.run();
    const before = await t.deals("JFK", 500);
    expect(before.length).toBe(153);

    t.site.broken = [1]; // a region's page answers 500: the night fails, all or nothing
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect((await t.deals("JFK", 500)).map((d) => d.id)).toEqual(before.map((d) => d.id));

    // The night that answered wrote every route for a day after its read; the one that failed wrote nothing.
    const [day] = (await t.iso.db.execute(sql`
      SELECT bool_and(valid_until = synced_at + interval '24 hours') AS ok FROM catalog.site_routes`)) as unknown as {
      ok: boolean;
    }[];
    expect(day?.ok).toBe(true);
    // Twenty-three hours on: still served. A day on: none.
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes SET synced_at = synced_at - interval '23 hours', valid_until = valid_until - interval '23 hours'`);
    expect((await t.deals("JFK", 500)).length).toBe(153);
    await t.iso.db.execute(sql`
      UPDATE catalog.site_routes SET synced_at = synced_at - interval '61 minutes', valid_until = valid_until - interval '61 minutes'`);
    expect(await t.deals("JFK", 500)).toEqual([]);
    expect(await t.deals("SEA")).toEqual([]);

    // The next night that answers brings them back for a day.
    t.site.broken = [];
    await t.run();
    expect((await t.deals("JFK", 500)).length).toBe(153);
    await t.iso.drop();
  }, 60_000);
});

describe("site deals — the switches", () => {
  it("with catalog.site_offers off none is served; on alone, the night reads the site", async () => {
    const t = await setup("deals-off");
    // Everything off: the night asks the site nothing, and there is no deal.
    expect(await t.run()).toMatchObject({ read: 0 });
    expect(t.calls).toEqual([]);
    expect(await t.cached("JFK")).toEqual([]);

    // The deals on, the pins and the photos off: the night reads the site for them.
    await t.flags.set("catalog.site_offers", { enabled: true });
    expect(await t.run()).toMatchObject({ read: 1 });
    expect(t.calls.length).toBeGreaterThan(200);
    expect((await t.cached("JFK")).length).toBe(24);

    // Off again: none, at once — the snapshot stays for the pins and the photos.
    await t.flags.set("catalog.site_offers", { enabled: false });
    expect(await t.cached("JFK")).toEqual([]);
    expect(await t.deals("JFK")).toEqual([]);
    await t.iso.drop();
  }, 60_000);

  it("a deal carries its city's photo as the places route serves it; none with the photos off", async () => {
    const t = await setup("deals-photo");
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.run();
    await t.iso.db.execute(sql`
      INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url, author, license, link, expires_at)
      VALUES ('HND', 'photo', 'wikimedia', 'https://upload.wikimedia.org/c.jpg', 'https://upload.wikimedia.org/h.jpg',
        'A. Person', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:x.jpg', now() + interval '30 days')
      ON CONFLICT (code) DO UPDATE SET status = 'photo', source = 'wikimedia', card_url = excluded.card_url,
        hero_url = excluded.hero_url, author = excluded.author, license = excluded.license, link = excluded.link`);
    const tokyo = (await t.deals("JFK", 500)).find((d) => d.destination.code === "HND");
    expect(tokyo?.destination).toMatchObject({
      city: "Tokyo",
      countryCode: "JP",
      photo: {
        card: "https://upload.wikimedia.org/c.jpg",
        hero: "https://upload.wikimedia.org/h.jpg",
        credit: {
          source: "wikimedia",
          author: "A. Person",
          license: "CC BY-SA 4.0",
          link: "https://commons.wikimedia.org/wiki/File:x.jpg",
        },
      },
    });
    // A city without a photo yet: none, and the app shows its own.
    const other = (await t.deals("JFK", 500)).find((d) => d.destination.code === "CDG");
    expect(other?.destination.photo).toBeNull();

    await t.flags.set("catalog.place_photos", { enabled: false });
    expect((await t.deals("JFK", 500)).find((d) => d.destination.code === "HND")?.destination.photo).toBeNull();
    await t.iso.drop();
  }, 60_000);
});
