/**
 * ADR-IMPL-067: Home's "Offers to inspire" — the member's own offers, then the company site's deals (catalog.site_offers):
 * from home, else the nearest city the site sells from, named; never a reference price; the ETag follows them; with the
 * flag off Home is exactly what it was. Made-up prices.
 */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { HomeVM } from "@bbc/shared/api/v1/fares";
import { SITE_DEALS_SHOWN } from "../src/presentation/mobile";
import { testApp } from "./helpers/test-app";

type T = Awaited<ReturnType<typeof testApp>>;

/** The site's snapshot as a night's sync leaves it: four cities, deals from New York's airports and Boston. */
async function seedSiteDeals(t: T) {
  await t.seedCatalogBasics();
  await t.db.execute(sql`
    INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted, image) VALUES
      (23, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'], false, 'bestDeals/23/image/l.jpg'),
      (8, 'Paris', 'France', 'Europe', 'CDG', ARRAY['CDG'], false, NULL),
      (283, 'Tokyo', 'Japan', 'Asia', 'HND', ARRAY['HND'], true, NULL),
      (512, 'Dubai', 'United Arab Emirates', 'Middle East', 'DXB', ARRAY['DXB'], false, NULL)`);
  // Made-up prices; an "Old Price" beside each, which Home must never carry.
  await t.db.execute(sql`
    INSERT INTO catalog.site_routes (route_from, cms_id, deal, price, published_price) VALUES
      ('JFK', 23, 9101, 1101, 2101), ('EWR', 23, 9101, 1101, 2101), ('LGA', 23, 9101, 1101, 2101),
      ('JFK', 8, 9102, 1201, 2201), ('JFK', 283, 9103, 1301, 2301), ('JFK', 512, 9104, 1401, NULL),
      ('BOS', 8, 9105, 1501, 2501)`);
}

const home = async (t: T, headers: Record<string, string> = {}) => {
  const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie, ...headers } });
  return {
    status: r.status,
    etag: r.headers.get("ETag"),
    json: (r.status === 200 ? await r.json() : null) as { deals?: unknown } | null,
  };
};

/** Every key of a JSON value, nested ones included. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  return [];
}

describe("GET /v1/home — the site's deals (ADR-IMPL-067)", () => {
  it("off: Home as before, no deals; on: after the member's offers, from home, a source and a day on each", async () => {
    const t = await testApp({ suite: "home-site-deals" });
    await seedSiteDeals(t);
    await t.seedBroadcastOffer({ routeTo: "CDG", title: "Autumn in Paris" });

    const off = await home(t);
    expect(off.status).toBe(200);
    expect(off.json).not.toHaveProperty("deals");
    expect(HomeVM.parse(off.json).deals).toBeUndefined();

    await t.flags.set("catalog.site_offers", { enabled: true });
    const on = await home(t);
    expect(on.status).toBe(200);
    expect(on.etag).not.toBe(off.etag);
    const body = HomeVM.parse(on.json);
    // The member's own offer first, in its section; the site's deals after it — Paris left out, since the offer above
    // already goes there from New York; Tokyo first (on the site's home page), then by traffic.
    expect(body.sections.find((s) => s.key === "inspire")?.items.map((i) => i.title)).toEqual(["Autumn in Paris"]);
    expect(body.deals?.map((d) => d.destination.code)).toEqual(["HND", "LHR", "DXB"]);
    const at = Date.now();
    for (const d of body.deals ?? []) {
      expect(d.origin).toEqual({ code: "JFK", city: "New York" });
      expect(d.price).toMatchObject({ currency: "USD", basis: "site", from: true });
      expect(Date.parse(d.validUntil)).toBeGreaterThan(at);
      expect(Date.parse(d.validUntil)).toBeLessThanOrEqual(at + 86_400_000 + 60_000);
    }
    expect(body.deals?.find((d) => d.destination.code === "LHR")).toMatchObject({
      id: "site-9101-JFK",
      destination: { city: "London", countryCode: "GB", name: "Heathrow", photo: null },
      price: { amount: 1101 },
    });
    // Never the site's "Old Price", nor the airports the BFF dedupes by.
    expect(keysOf(on.json?.deals).filter((k) => /published|old|save|airports|originAirports/i.test(k))).toEqual([]);

    // The same Home again: 304 on its ETag.
    expect((await home(t, { "If-None-Match": on.etag! })).status).toBe(304);

    // Off again: as before, at once.
    await t.flags.set("catalog.site_offers", { enabled: false });
    const again = await home(t);
    expect(again.json).not.toHaveProperty("deals");
    expect(again.etag).toBe(off.etag);
    await t.close();
  });

  it("an offer past the inspiring six still keeps its city's deal off Home: no city twice for one origin", async () => {
    const t = await testApp({ suite: "home-site-deals-seventh" });
    await seedSiteDeals(t);
    await t.flags.set("catalog.site_offers", { enabled: true });
    // Seven offers from New York, newest first in the feed: Tokyo's is the oldest, the seventh — in no inspiring card,
    // but in its region's row (16, `To Asia`). Made-up prices.
    const hour = 3_600_000;
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await t.seedBroadcastOffer({
      routeTo: "HND",
      title: "Tokyo in spring",
      price: "4650.00",
      publishedPrice: "8100.00",
      publishAt: new Date(Date.now() - 7 * hour).toISOString(),
      validUntil,
    });
    const others = ["FCO", "MAD", "BCN", "AMS", "ZRH", "SIN"];
    for (const [i, to] of others.entries()) {
      await t.seedBroadcastOffer({
        routeTo: to,
        title: `Offer ${i + 1}`,
        publishAt: new Date(Date.now() - (6 - i) * hour).toISOString(),
        validUntil,
      });
    }

    const body = HomeVM.parse((await home(t)).json);
    const inspire = body.sections.find((s) => s.key === "inspire")?.items ?? [];
    expect(inspire).toHaveLength(6);
    expect(inspire.some((i) => i.route.to === "HND")).toBe(false);
    expect(body.sections.find((s) => s.key === "asia")?.items.map((i) => [i.route.from, i.route.to])).toContainEqual([
      "JFK",
      "HND",
    ]);
    // The site's Tokyo from New York is left out: the member's own Tokyo offer stands on Home already.
    expect(body.deals?.map((d) => d.destination.code)).toEqual(["LHR", "CDG", "DXB"]);
    await t.close();
  });

  it("a home the site sells nothing from: the nearest city's deals first, each naming it", async () => {
    const t = await testApp({ suite: "home-site-deals-nearest" });
    await seedSiteDeals(t);
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.db.execute(sql`UPDATE members.profile SET home_airport = 'PVD' WHERE member_id = ${t.memberA.id}`);

    // Providence: Boston (about 70 km) has Paris; New York the rest.
    const body = HomeVM.parse((await home(t)).json);
    expect(body.home?.code).toBe("PVD");
    expect(body.deals?.map((d) => [d.destination.code, d.origin.city])).toEqual([
      ["CDG", "Boston"],
      ["HND", "New York"],
      ["LHR", "New York"],
      ["DXB", "New York"],
    ]);
    expect(body.deals?.length).toBeLessThanOrEqual(SITE_DEALS_SHOWN);
    await t.close();
  });

  it(`still ${SITE_DEALS_SHOWN} deals when the member's offers take some off: the cap comes after them`, async () => {
    const t = await testApp({ suite: "home-site-deals-cap" });
    await t.seedCatalogBasics();
    await t.flags.set("catalog.site_offers", { enabled: true });
    // One more city from New York than Home shows; Rome on the site's home page, so its deal comes first.
    const cities = ["FCO", "MAD", "BCN", "AMS", "ZRH", "SIN", "ATH", "LIS", "VIE", "PRG", "BER", "CPH", "OSL"];
    cities.push("ARN", "HEL", "DUB", "EDI", "IST", "DOH", "BKK", "ICN", "SYD", "MEX", "GRU", "CPT");
    expect(cities).toHaveLength(SITE_DEALS_SHOWN + 1);
    await t.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted)
      SELECT 9000 + x.ord, a.city, a.country, 'Somewhere', a.code, ARRAY[a.code], x.ord = 1
      FROM unnest(string_to_array(${cities.join(",")}, ',')) WITH ORDINALITY AS x(code, ord) JOIN catalog.airports a ON a.code = x.code`);
    // Made-up prices.
    await t.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price)
      SELECT 'JFK', cms_id, cms_id, 1001 FROM catalog.site_places`);

    const before = HomeVM.parse((await home(t)).json);
    expect(before.deals).toHaveLength(SITE_DEALS_SHOWN);
    expect(before.deals?.[0]?.destination.code).toBe("FCO");

    // The member's own Rome from New York takes the site's Rome off — and the city after the cap comes in.
    await t.seedBroadcastOffer({ routeTo: "FCO", title: "Rome in winter" });
    const after = HomeVM.parse((await home(t)).json);
    expect(after.deals).toHaveLength(SITE_DEALS_SHOWN);
    expect(after.deals?.some((d) => d.destination.code === "FCO")).toBe(false);
    expect(new Set(after.deals?.map((d) => d.destination.code))).toEqual(new Set(cities.slice(1)));
    await t.close();
  });

  it("an offer to a deal's city from another origin leaves the deal on Home; one from the deal's origin takes it off", async () => {
    const t = await testApp({ suite: "home-site-deals-origin" });
    await seedSiteDeals(t);
    await t.flags.set("catalog.site_offers", { enabled: true });
    await t.db.execute(sql`UPDATE members.profile SET home_airport = 'PVD' WHERE member_id = ${t.memberA.id}`);

    // Providence: Paris is Boston's deal. The member's Paris offer leaves from New York — another origin, so both stand:
    // the offer from New York, the site's deal from Boston.
    await t.seedBroadcastOffer({ routeFrom: "JFK", routeTo: "CDG", title: "Autumn in Paris" });
    const fromNewYork = HomeVM.parse((await home(t)).json);
    expect(fromNewYork.sections.find((s) => s.key === "inspire")?.items.map((i) => i.route.from)).toEqual(["JFK"]);
    expect(fromNewYork.deals?.map((d) => [d.destination.code, d.origin.city])).toEqual([
      ["CDG", "Boston"],
      ["HND", "New York"],
      ["LHR", "New York"],
      ["DXB", "New York"],
    ]);

    // An offer to Paris from Boston: the site's Paris from Boston leaves, and no other origin's Paris takes its place.
    await t.seedBroadcastOffer({ routeFrom: "BOS", routeTo: "CDG", title: "Paris from Boston" });
    const fromBoston = HomeVM.parse((await home(t)).json);
    expect(fromBoston.deals?.map((d) => [d.destination.code, d.origin.city])).toEqual([
      ["HND", "New York"],
      ["LHR", "New York"],
      ["DXB", "New York"],
    ]);
    await t.close();
  });
});
