/** ADR-IMPL-068: what a tap anywhere on the globe may open, against the database — the site's snapshot, the flag, the
 *  home airport and its metro, and the formula's reach, which never counts. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { airports } from "@bbc/db/schema/catalog";
import { createPlatform } from "@bbc/platform";
import { toEstimateVM } from "../../src/application/to-fare-vm";
import { airportsRepo } from "../../src/infrastructure/airports.repo";
import { catalogModule } from "../../src/module";
import { storedPricingRules } from "../../src/pricing/rules";
import { FIXTURE_RULES } from "../unit/pricing-rules.fixture";
import { fakeClock, fakeSiteFetch, siteFixture, type FakeSite } from "../unit/site.fixture";

async function setup(name: string, site: FakeSite = siteFixture()) {
  const iso = await isolatedDb(name);
  const calls: string[] = [];
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({ fetch: fakeSiteFetch(site, calls), siteClock: fakeClock() }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  const job = out.jobs?.find((j) => j.name === "sync-site-destinations");
  if (!job) throw new Error("sync-site-destinations missing");
  const jfk = (await airportsRepo.get(iso.db, "JFK"))!;
  return {
    iso,
    site,
    calls,
    flags: platform.flags,
    facade: out.exposes!,
    run: () => job.spec.handler({ signal: new AbortController().signal } as never) as Promise<Record<string, number>>,
    /** A member at JFK, as Home asks: the code and the place. */
    fromJfk: { code: "JFK", lat: Number(jfk.lat), lng: Number(jfk.lng) },
  };
}

const codes = (list: { code: string }[] | null) => list?.map((p) => p.code) ?? null;

/** An executor that records every use and answers none: what the facade does with it, it does with the database. */
function watchedExecutor() {
  const used: string[] = [];
  const exec = new Proxy(
    {},
    {
      get(_, prop) {
        used.push(String(prop));
        return undefined;
      },
    },
  ) as Executor;
  return { exec, used };
}

describe("bookable — what a tap on the globe may open", () => {
  it("off: nothing is read and nothing answered; on alone, the night reads the site", async () => {
    const t = await setup("bookable-flag");
    expect(await t.facade.bookable(undefined, { home: t.fromJfk })).toBeNull();
    // Off, the flag is asked first and nothing else: the caller's executor is never touched — no read of the site's
    // set on any member's Home while the flag is off.
    const off = watchedExecutor();
    expect(await t.facade.bookable(off.exec, { home: t.fromJfk })).toBeNull();
    expect(off.used).toEqual([]);
    // All three of the site's switches off: the night asks the site nothing.
    await t.run();
    expect(t.calls).toEqual([]);

    await t.flags.set("catalog.globe_tap", { enabled: true });
    await t.run();
    expect(t.calls.length).toBeGreaterThan(0);
    expect((await t.facade.bookable(undefined, { home: t.fromJfk }))?.length).toBeGreaterThan(0);
    await t.flags.set("catalog.globe_tap", { enabled: false });
    expect(await t.facade.bookable(undefined, { home: t.fromJfk })).toBeNull();
    await t.iso.drop();
  });

  it("the site's cities by their main airport and the US airports it sells from — never home or its metro", async () => {
    const t = await setup("bookable-set");
    await t.flags.set("catalog.globe_tap", { enabled: true });
    await t.run();

    // London, Valencia, Santorini, Crete, Victoria and Tokyo by their main airports (Kyoto has none); the US cities the
    // site lists a price from (Chicago's two, Jacksonville, Los Angeles; Atlantis is no city) — New York's three are
    // the member's home and its metro (Newark 33 km, LaGuardia 17 km).
    const fromJfk = codes(await t.facade.bookable(undefined, { home: t.fromJfk }));
    expect(fromJfk).toEqual(["HER", "HND", "JAX", "JTR", "LAX", "LHR", "MDW", "ORD", "SEZ", "VLC"]);

    // From London, London itself goes and New York's three come in.
    const lhr = (await airportsRepo.get(t.iso.db, "LHR"))!;
    const fromLondon = codes(
      await t.facade.bookable(undefined, { home: { code: "LHR", lat: Number(lhr.lat), lng: Number(lhr.lng) } }),
    );
    expect(fromLondon).toContain("JFK");
    expect(fromLondon).toContain("EWR");
    expect(fromLondon).toContain("LGA");
    expect(fromLondon).not.toContain("LHR");
    await t.iso.drop();
  });

  it("a formula price alone makes no city bookable: the formula prices most of the world from JFK, the set holds ten", async () => {
    const t = await setup("bookable-formula");
    await t.flags.set("catalog.globe_tap", { enabled: true });
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
    await t.run();

    const all = await t.iso.db.select().from(airports);
    const home = all.find((a) => a.code === "JFK")!;
    const priced = all.filter((a) => toEstimateVM(FIXTURE_RULES, home, a, "business") !== null).map((a) => a.code);
    const set = new Set(codes(await t.facade.bookable(undefined, { home: t.fromJfk })));
    expect(priced.length).toBeGreaterThan(1000);
    expect(set.size).toBe(10);
    // Paris, Rome and Toronto are priced by the formula and listed by no source here: not bookable.
    for (const code of ["CDG", "FCO", "YYZ"]) {
      expect(priced).toContain(code);
      expect(set.has(code)).toBe(false);
    }
    await t.iso.drop();
  });

  it("the caller's fares and offers join the set, once each; two cities naming one airport give one entry", async () => {
    const site = siteFixture();
    // A second Tokyo on the site, on the same main airport.
    site.regions[2]!.countries[0]!.cities.push({
      id: 9283,
      name: "Tokyo",
      image: null,
      deals: [{ id: 9901, name: "New York", price: 1000, old: null }], // a made-up price
    });
    const t = await setup("bookable-also", site);
    await t.flags.set("catalog.globe_tap", { enabled: true });
    await t.run();
    const [cdg, hnd] = await Promise.all([airportsRepo.get(t.iso.db, "CDG"), airportsRepo.get(t.iso.db, "HND")]);
    const asPlace = (a: NonNullable<typeof cdg>) => ({
      code: a.code,
      name: a.name,
      city: a.city,
      countryCode: a.countryCode,
      lat: Number(a.lat),
      lng: Number(a.lng),
    });
    const got = (await t.facade.bookable(undefined, { home: t.fromJfk, also: [asPlace(cdg!), asPlace(hnd!)] }))!;
    expect(got.filter((p) => p.code === "HND")).toHaveLength(1);
    expect(got.find((p) => p.code === "CDG")).toMatchObject({ city: "Paris", countryCode: "FR" });
    expect(got.length).toBe(11);
    await t.iso.drop();
  });

  it("the night's sync is seen at once: a city that leaves the site leaves the set", async () => {
    const t = await setup("bookable-sync");
    await t.flags.set("catalog.globe_tap", { enabled: true });
    await t.run();
    expect(codes(await t.facade.bookable(undefined, { home: t.fromJfk }))).toContain("HND");
    t.site.regions = t.site.regions.filter((r) => r.name !== "Asia");
    t.site.promoted = [];
    await t.run();
    const after = codes(await t.facade.bookable(undefined, { home: t.fromJfk }));
    expect(after).not.toContain("HND");
    // Los Angeles listed a price only for Tokyo: it goes with it.
    expect(after).not.toContain("LAX");
    const [row] = (await t.iso.db.execute(sql`SELECT count(*)::int AS n FROM catalog.site_places`)) as unknown as {
      n: number;
    }[];
    expect(row?.n).toBe(5);
    await t.iso.drop();
  });
});
