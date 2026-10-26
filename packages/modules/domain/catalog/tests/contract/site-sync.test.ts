/** The site's destinations against the database (ADR-IMPL-045): the nightly job, its photos, its pins, its failures. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import type { Fetch } from "../../src/application/place-photo-sources";
import { LEGACY_SITE_STORAGE, SITE_STORAGE, SiteError } from "../../src/application/site-cms";
import { toEstimateVM } from "../../src/application/to-fare-vm";
import { airportsRepo } from "../../src/infrastructure/airports.repo";
import { SITE_PINS, catalogModule } from "../../src/module";
import { storedPricingRules } from "../../src/pricing/rules";
import { FIXTURE_RULES } from "../unit/pricing-rules.fixture";
import { fakeClock, fakeSiteFetch, siteFixture, type FakeSite } from "../unit/site.fixture";

/** The module on a fresh database, the site answering from `site` (read again on every request: change it and run). */
async function setup(name: string, site: FakeSite = siteFixture()) {
  const iso = await isolatedDb(name);
  const calls: string[] = [];
  /** One night's own `fetch` (runWith); otherwise the site as `site` says. */
  let tonight: Fetch | null = null;
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({
    fetch: (url, init) => (tonight ?? fakeSiteFetch(site, calls))(url, init),
    siteClock: fakeClock(),
  }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  const job = out.jobs?.find((j) => j.name === "sync-site-destinations");
  if (!job) throw new Error("sync-site-destinations missing");
  const photo = async (code: string) => {
    const [row] = (await iso.db.execute(sql`
      SELECT status, source, card_url, (expires_at = 'infinity') AS forever
      FROM catalog.place_photos WHERE code = ${code}`)) as unknown as {
      status: string;
      source: string | null;
      card_url: string | null;
      forever: boolean;
    }[];
    return row ? { status: row.status, source: row.source, cardUrl: row.card_url, forever: row.forever } : null;
  };
  return {
    iso,
    site,
    calls,
    flags: platform.flags,
    facade: out.exposes!,
    run: () => job.spec.handler({ signal: new AbortController().signal } as never) as Promise<Record<string, number>>,
    runWith: async (fetch: Fetch) => {
      tonight = fetch;
      try {
        return (await job.spec.handler({ signal: new AbortController().signal } as never)) as Record<string, number>;
      } finally {
        tonight = null;
      }
    },
    photo,
    places: async () =>
      (
        (await iso.db.execute(sql`
          SELECT cms_id, airport, airports, promoted, image FROM catalog.site_places ORDER BY cms_id`)) as unknown as {
          cms_id: number;
          airport: string;
          airports: string[];
          promoted: boolean;
          image: string | null;
        }[]
      ).map((r) => ({
        cmsId: r.cms_id,
        airport: r.airport,
        airports: r.airports,
        promoted: r.promoted,
        image: r.image,
      })),
    routes: async (cmsId: number) =>
      (
        (await iso.db.execute(sql`
          SELECT route_from, price, published_price
          FROM catalog.site_routes WHERE cms_id = ${cmsId} ORDER BY route_from`)) as unknown as {
          route_from: string;
          price: number;
          published_price: number | null;
        }[]
      ).map((r) => ({ from: r.route_from.trim(), price: r.price, published: r.published_price })),
    operatorPhoto: (code: string, url: string) =>
      iso.db.execute(sql`
        INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url, expires_at)
        VALUES (${code}, 'photo', 'override', ${url}, ${url}, 'infinity')
        ON CONFLICT (code) DO UPDATE SET status = 'photo', source = 'override', card_url = ${url}, hero_url = ${url},
          expires_at = 'infinity'`),
  };
}

const siteUrl = (path: string) => SITE_STORAGE + path;
/** Where the site served its photos before (ADR-IMPL-062): rows a night wrote then. */
const legacyUrl = (path: string) => LEGACY_SITE_STORAGE + path;

describe("site destinations — the nightly job", () => {
  it("with its photos and its pins off, it asks the site nothing and hands the site's photos back", async () => {
    const t = await setup("site-off");
    await t.operatorPhoto("LHR", siteUrl("bestDeals/23/image/london01.jpg"));
    await t.operatorPhoto("CDG", "https://photos.example.test/paris.jpg");

    const report = await t.run();
    expect(report).toMatchObject({ read: 0, photosCleared: 1 });
    expect(t.calls).toEqual([]);
    expect(await t.photo("LHR")).toMatchObject({ status: "pending", source: null, forever: false });
    expect(await t.photo("CDG")).toMatchObject({ status: "photo", source: "override", forever: true });
    await t.iso.drop();
  });

  it("photos on: the snapshot, and each city's own photo on all its airports — never over an operator's own", async () => {
    const t = await setup("site-photos");
    await t.flags.set("catalog.site_photos", { enabled: true, skip: [947] });
    await t.operatorPhoto("LGW", "https://photos.example.test/gatwick.jpg");

    const report = await t.run();
    expect(report).toMatchObject({ read: 1, cities: 7, failed: 0, unmapped: 1, borrowed: 1, imagesMissing: 0 });

    const places = await t.places();
    expect(places.map((p) => p.cmsId)).toEqual([23, 236, 283, 858, 947, 1153]);
    const byId = new Map(places.map((p) => [p.cmsId, p]));
    expect(byId.get(23)).toMatchObject({ airport: "LHR", promoted: false, image: "bestDeals/23/image/london01.jpg" });
    expect(byId.get(23)!.airports).toEqual(expect.arrayContaining(["LHR", "LGW"]));
    expect(byId.get(858)).toMatchObject({ airport: "SEZ", airports: ["SEZ"] });
    expect(byId.get(283)).toMatchObject({ airport: "HND", promoted: true });
    expect(byId.get(1153)).toMatchObject({ airport: "HER", airports: ["HER", "CHQ", "JSH"], image: null });

    // New York's price lands on its three airports; a US city without an airport (Atlantis) and Boston (no price) don't.
    expect(await t.routes(23)).toEqual([
      { from: "EWR", price: 788, published: 2288 },
      { from: "JAX", price: 1083, published: 1740 },
      { from: "JFK", price: 788, published: 2288 },
      { from: "LGA", price: 788, published: 2288 },
      { from: "MDW", price: 1250, published: 2258 },
      { from: "ORD", price: 1250, published: 2258 },
    ]);

    // The site's photo, as an operator's: no expiry, no credit line.
    expect(await t.photo("LHR")).toEqual({
      status: "photo",
      source: "override",
      cardUrl: siteUrl("bestDeals/23/image/london01.jpg"),
      forever: true,
    });
    expect(await t.photo("SEZ")).toMatchObject({ cardUrl: siteUrl("bestDeals/858/image/victoria.jpg") });
    expect(await t.photo("NRT")).toMatchObject({ cardUrl: siteUrl("bestDeals/283/image/tokyo.jpg") });
    // An operator's own photo stays; a skipped city (Valencia) and a borrowed photo (Crete's) stay off.
    expect(await t.photo("LGW")).toMatchObject({ cardUrl: "https://photos.example.test/gatwick.jpg" });
    expect(await t.photo("VLC")).toBeNull();
    expect(await t.photo("HER")).toBeNull();

    // The same night again changes no photo.
    expect(await t.run()).toMatchObject({ read: 1, photosSet: 0, photosCleared: 0 });

    // Skip lifted, then the photos off: Valencia gets its own; then every site photo goes back to the resolve job.
    await t.flags.set("catalog.site_photos", { enabled: true });
    expect((await t.run()).photosSet).toBe(1);
    expect(await t.photo("VLC")).toMatchObject({ cardUrl: siteUrl("bestDeals/947/image/valencia.webp") });
    await t.flags.set("catalog.site_pins", { enabled: true });
    await t.flags.set("catalog.site_photos", { enabled: false });
    const off = await t.run();
    expect(off).toMatchObject({ read: 1, photosSet: 0 });
    expect(off.photosCleared).toBeGreaterThan(5);
    expect(await t.photo("LHR")).toMatchObject({ status: "pending", source: null });
    expect(await t.photo("LGW")).toMatchObject({ cardUrl: "https://photos.example.test/gatwick.jpg" });
    await t.iso.drop();
  });

  it("a photo stored under the site's former address is the site's: the next night moves it or hands it back", async () => {
    const t = await setup("site-legacy");
    await t.operatorPhoto("LHR", legacyUrl("bestDeals/23/image/london01.jpg"));
    await t.operatorPhoto("SEZ", legacyUrl("bestDeals/858/image/victoria-old.jpg"));
    await t.operatorPhoto("CDG", legacyUrl("bestDeals/9999/image/paris.jpg")); // a city the site no longer lists
    await t.operatorPhoto("LGW", "https://photos.example.test/gatwick.jpg");
    await t.flags.set("catalog.site_photos", { enabled: true });

    await t.run();
    expect(await t.photo("LHR")).toEqual({
      status: "photo",
      source: "override",
      cardUrl: siteUrl("bestDeals/23/image/london01.jpg"),
      forever: true,
    });
    expect(await t.photo("SEZ")).toMatchObject({ cardUrl: siteUrl("bestDeals/858/image/victoria.jpg") });
    expect(await t.photo("CDG")).toMatchObject({ status: "pending", source: null, cardUrl: null });
    // An operator's own photo, at an address that is not the site's, stays as ever.
    expect(await t.photo("LGW")).toMatchObject({ cardUrl: "https://photos.example.test/gatwick.jpg" });
    await t.iso.drop();
  });

  it("a city skipped, or the photos off, hands back its photo under the former address too", async () => {
    const t = await setup("site-legacy-off");
    await t.operatorPhoto("LHR", legacyUrl("bestDeals/23/image/london01.jpg"));
    await t.operatorPhoto("SEZ", legacyUrl("bestDeals/858/image/victoria.jpg"));

    // A night the site does not answer: the skip acts first, by address — London's goes, Victoria's stays.
    t.site.broken = [603];
    await t.flags.set("catalog.site_photos", { enabled: true, skip: [23] });
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect(await t.photo("LHR")).toMatchObject({ status: "pending", source: null });
    expect(await t.photo("SEZ")).toMatchObject({
      status: "photo",
      cardUrl: legacyUrl("bestDeals/858/image/victoria.jpg"),
    });

    await t.flags.set("catalog.site_photos", { enabled: false });
    expect(await t.run()).toMatchObject({ read: 0, photosCleared: 1 });
    expect(await t.photo("SEZ")).toMatchObject({ status: "pending", source: null });
    await t.iso.drop();
  });

  it("a city that stops answering keeps its rows; a photo that does not answer is not used; a removed city goes", async () => {
    const t = await setup("site-failures");
    await t.flags.set("catalog.site_photos", { enabled: true });
    await t.run();
    expect(await t.photo("SEZ")).toMatchObject({ status: "photo" });

    t.site.broken = [858];
    t.site.missingImages = ["bestDeals/947/image/valencia.webp"];
    const night2 = await t.run();
    expect(night2).toMatchObject({ failed: 1, imagesMissing: 1 });
    expect((await t.places()).find((p) => p.cmsId === 858)).toMatchObject({ airport: "SEZ" });
    expect(await t.routes(858)).toEqual([
      { from: "EWR", price: 1500, published: 2500 },
      { from: "JFK", price: 1500, published: 2500 },
      { from: "LGA", price: 1500, published: 2500 },
    ]);
    expect(await t.photo("SEZ")).toMatchObject({ status: "photo" });
    expect((await t.places()).find((p) => p.cmsId === 947)?.image).toBeNull();
    expect(await t.photo("VLC")).toMatchObject({ status: "pending" });

    // Valencia leaves the site: its row, its routes and its photo go.
    t.site.broken = [];
    t.site.missingImages = [];
    t.site.regions[0]!.countries = t.site.regions[0]!.countries.filter((c) => c.name !== "Spain");
    await t.run();
    expect((await t.places()).some((p) => p.cmsId === 947)).toBe(false);
    expect(await t.routes(947)).toEqual([]);
    await t.iso.drop();
  });

  it("a site answering far fewer cities than last night, or too many broken pages, changes nothing", async () => {
    const t = await setup("site-shrink");
    await t.flags.set("catalog.site_photos", { enabled: true });
    await t.run();
    const before = await t.places();

    const full = structuredClone(t.site.regions);
    t.site.regions = [t.site.regions[2]!]; // only Asia: 2 cities of 7
    await expect(t.run()).rejects.toBeInstanceOf(SiteError);
    expect(await t.places()).toEqual(before);

    t.site.regions = full;
    t.site.broken = [23, 236, 283, 858];
    await expect(t.run()).rejects.toThrow("did not answer");
    expect(await t.places()).toEqual(before);

    t.site.broken = [603];
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect(await t.places()).toEqual(before);
    expect(await t.photo("LHR")).toMatchObject({ status: "photo" });
    await t.iso.drop();
  });

  it("photos off, or a city skipped, takes effect on a night the site does not answer", async () => {
    const t = await setup("site-switch");
    await t.flags.set("catalog.site_photos", { enabled: true });
    await t.run();
    expect(await t.photo("LHR")).toMatchObject({ status: "photo" });
    expect(await t.photo("SEZ")).toMatchObject({ status: "photo" });

    t.site.broken = [603]; // a region page fails: the night itself fails
    await t.flags.set("catalog.site_photos", { enabled: true, skip: [858] });
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect(await t.photo("SEZ")).toMatchObject({ status: "pending", source: null });
    expect(await t.photo("LHR")).toMatchObject({ status: "photo" });

    await t.flags.set("catalog.site_pins", { enabled: true });
    await t.flags.set("catalog.site_photos", { enabled: false });
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect(await t.photo("LHR")).toMatchObject({ status: "pending", source: null });
    await t.iso.drop();
  });

  it("a skipped city takes back only its own photos: an airport it shares keeps the other city's", async () => {
    const site = siteFixture();
    site.regions[2]!.countries[0]!.cities.push({
      id: 9283,
      name: "Tokyo",
      image: "bestDeals/9283/image/tokyo-two.jpg",
      deals: [{ id: 9901, name: "New York", price: 1700, old: null }],
    });
    const t = await setup("site-skip-shared", site);
    await t.flags.set("catalog.site_photos", { enabled: true, skip: [9283] });
    await t.run();
    expect(await t.photo("HND")).toMatchObject({ cardUrl: siteUrl("bestDeals/283/image/tokyo.jpg") });
    // A night that does not answer: the skip acts first, by address — Tokyo (283) keeps its photo.
    t.site.broken = [603];
    await expect(t.run()).rejects.toThrow("HTTP 500");
    expect(await t.photo("HND")).toMatchObject({ cardUrl: siteUrl("bestDeals/283/image/tokyo.jpg") });
    // A night that does: nothing moves.
    t.site.broken = [];
    expect(await t.run()).toMatchObject({ photosSet: 0, photosCleared: 0 });
    await t.iso.drop();
  });

  it("a night whose cities no longer find their airports changes nothing", async () => {
    const t = await setup("site-collapse");
    await t.flags.set("catalog.site_photos", { enabled: true });
    await t.run();
    const before = await t.places();
    // The site renames its cities: the same pages, names our airports do not know.
    for (const region of t.site.regions)
      for (const country of region.countries) for (const city of country.cities) city.name += ", somewhere";
    await expect(t.run()).rejects.toThrow("found their airports");
    expect(await t.places()).toEqual(before);
    expect(await t.photo("LHR")).toMatchObject({ status: "photo" });
    await t.iso.drop();
  });

  it("a photo that cannot be asked keeps last night's verdict; two cities naming one airport give it one photo", async () => {
    const site = siteFixture();
    // A second page for Tokyo, with a higher id: its airports are Tokyo's.
    site.regions[2]!.countries[0]!.cities.push({
      id: 9283,
      name: "Tokyo",
      image: "bestDeals/9283/image/tokyo-two.jpg",
      deals: [{ id: 9901, name: "New York", price: 1700, old: null }],
    });
    const t = await setup("site-unknown", site);
    await t.flags.set("catalog.site_photos", { enabled: true });
    await t.run();
    expect(await t.photo("HND")).toMatchObject({ cardUrl: siteUrl("bestDeals/283/image/tokyo.jpg") });

    // London's photo cannot be asked tonight (the site answers 503): it stays. Tokyo's own page fails: the airport
    // keeps the photo of the city with the lower id, not the other's.
    t.site.broken = [283];
    const site503 = fakeSiteFetch(t.site);
    const report = await t.runWith((url, init) =>
      url.endsWith("london01.jpg") && init?.method === "HEAD"
        ? Promise.resolve(new Response("busy", { status: 503 }))
        : site503(url, init),
    );
    expect(report).toMatchObject({ imagesUnknown: 1, failed: 1 });
    expect((await t.places()).find((p) => p.cmsId === 23)?.image).toBe("bestDeals/23/image/london01.jpg");
    expect(await t.photo("LHR")).toMatchObject({ status: "photo" });
    expect(await t.photo("HND")).toMatchObject({ cardUrl: siteUrl("bestDeals/283/image/tokyo.jpg") });
    await t.iso.drop();
  });
});

describe("site destinations — the pins", () => {
  async function pinsSetup(name: string, site?: FakeSite) {
    const t = await setup(name, site);
    await t.flags.set("catalog.site_pins", { enabled: true });
    await t.run();
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    await t.iso.db.execute(sql`
      INSERT INTO catalog.fares (
        route_from, route_to, cabin, carrier, carrier_name, nonstop, price, currency, source,
        valid_from, valid_until, published
      ) VALUES
        ('JFK', 'LGW', 'business', 'BA', 'British Airways', true, '4200.00', 'USD', 'manual',
         ${from}::timestamptz, ${until}::timestamptz, true)`);
    return t;
  }

  const formula = async (db: Parameters<typeof airportsRepo.get>[0], to: string, cabin: "business" | "first") => {
    const [home, dest] = await Promise.all([airportsRepo.get(db, "JFK"), airportsRepo.get(db, to)]);
    return toEstimateVM(FIXTURE_RULES, home!, dest!, cabin)?.amount ?? null;
  };

  it("after the fares' pins: the site's cities from home, priced by the formula in the member's cabin", async () => {
    const t = await pinsSetup("site-pins");
    const pins = await t.facade.destinations(undefined, "JFK");

    // London has a fare (to Gatwick): its fare pin stands for the city, no second London pin.
    expect(pins[0]).toMatchObject({ code: "LGW", fromPrice: 4200 });
    const site = pins.slice(1);
    expect(site.some((p) => ["LHR", "LGW"].includes(p.code))).toBe(false);
    // Tokyo first (on the site's home page); Kyoto has no airport; each price is the formula's.
    expect(site[0]?.code).toBe("HND");
    expect(site.map((p) => p.code).sort()).toEqual(["HER", "HND", "JTR", "SEZ", "VLC"]);
    for (const p of site) expect(p.fromPrice).toBe((await formula(t.iso.db, p.code, "business"))!);

    // First class: the formula's first-class price where it has one, no pin where it has none.
    const first = (await t.facade.destinations(undefined, "JFK", { cabin: "first" })).slice(1);
    for (const p of first) expect(p.fromPrice).toBe((await formula(t.iso.db, p.code, "first"))!);

    // From an airport the site lists nothing from: the fares' pins only.
    expect(await t.facade.destinations(undefined, "MIA")).toEqual([]);
    await t.iso.drop();
  });

  it("nothing from the site with its pins off, or with estimates off (no price, no pin)", async () => {
    const t = await pinsSetup("site-pins-off");
    await t.flags.set("catalog.estimates", { enabled: false });
    expect((await t.facade.destinations(undefined, "JFK")).map((p) => p.code)).toEqual(["LGW"]);
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.site_pins", { enabled: false });
    expect((await t.facade.destinations(undefined, "JFK")).map((p) => p.code)).toEqual(["LGW"]);
    await t.iso.drop();
  });

  it(`at most ${SITE_PINS} of the site's cities, and the night's sync is seen at once`, async () => {
    const site = siteFixture();
    const names: [string, string][] = [
      ["Paris", "France"],
      ["Rome", "Italy"],
      ["Madrid", "Spain"],
      ["Berlin", "Germany"],
      ["Amsterdam", "Netherlands"],
      ["Vienna", "Austria"],
      ["Zurich", "Switzerland"],
      ["Lisbon", "Portugal"],
      ["Athens", "Greece"],
      ["Prague", "Czech Republic"],
      ["Dublin", "Ireland"],
      ["Copenhagen", "Denmark"],
    ];
    site.regions[0]!.countries.push(
      ...names.map(([city, country], i) => ({
        id: 3000 + i,
        name: country,
        cities: [
          {
            id: 4000 + i,
            name: city,
            image: `bestDeals/${4000 + i}/image/x.jpg`,
            deals: [{ id: 5000 + i, name: "New York", price: 1000 + i, old: null }],
          },
        ],
      })),
    );
    const t = await pinsSetup("site-pins-cap", site);
    const pins = await t.facade.destinations(undefined, "JFK");
    expect(pins.length).toBe(1 + SITE_PINS);
    expect(pins[1]?.code).toBe("HND");

    // Tokyo leaves the site: the next night's sync drops its pin without waiting for the cache.
    t.site.regions = t.site.regions.filter((r) => r.name !== "Asia");
    t.site.promoted = [];
    await t.run();
    expect((await t.facade.destinations(undefined, "JFK")).some((p) => p.code === "HND")).toBe(false);
    await t.iso.drop();
  });
  it("two of the site's cities naming one airport give one pin", async () => {
    const site = siteFixture();
    site.regions[2]!.countries[0]!.cities.push({
      id: 9283,
      name: "Tokyo",
      image: null,
      deals: [{ id: 9901, name: "New York", price: 1700, old: null }],
    });
    const t = await pinsSetup("site-pins-once", site);
    const codes = (await t.facade.destinations(undefined, "JFK")).map((p) => p.code);
    expect(codes.filter((c) => c === "HND")).toEqual(["HND"]);
    expect(codes.filter((c) => c === "NRT")).toEqual([]);
    await t.iso.drop();
  });
});
