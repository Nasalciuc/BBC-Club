/** The site's destinations (ADR-IMPL-045): reading the site, and finding each city's airports. */
import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";

import { REFERENCE_TSV, parseReference } from "../../../../../db/scripts/airports-reference";
import {
  API_GAP_MS,
  LEGACY_SITE_STORAGE,
  SITE_API,
  SITE_STORAGE,
  SITE_STORAGE_PREFIXES,
  SiteError,
  dollars,
  imageCheck,
  inPool,
  readSite,
  retryAfterMs,
  sitePacer,
  systemClock,
  toSiteCity,
  type SiteDeps,
} from "../../src/application/site-cms";
import {
  cityAirports,
  imageOf,
  indexAirports,
  originAirports,
  planSite,
  type MappingAirport,
} from "../../src/application/site-places";
import { SITE_CITIES } from "./site-cities.fixture";
import { fakeClock, fakeSiteFetch, siteFixture } from "./site.fixture";

const refAirport = (code: string, city: string, country: string, countryCode: string, popularity: number, terms = "") =>
  ({ code, city, country, countryCode, popularity, searchTerms: terms || null }) satisfies MappingAirport;

/** The airports the names meet, as the reference has them (popularity, search terms). */
const AIRPORTS: MappingAirport[] = [
  refAirport("JFK", "New York", "United States", "US", 100, "Manhattan | New York City | NYC"),
  refAirport("EWR", "Newark", "United States", "US", 70, "Manhattan | New York City | NYC"),
  refAirport("LGA", "New York", "United States", "US", 30, "NYC"),
  refAirport("ORD", "Chicago", "United States", "US", 91, "CHI"),
  refAirport("MDW", "Chicago", "United States", "US", 35, "CHI"),
  refAirport("JAX", "Jacksonville", "United States", "US", 35),
  refAirport("OAJ", "Jacksonville", "United States", "US", 10),
  refAirport("LAX", "Los Angeles", "United States", "US", 96),
  refAirport("LHR", "London", "United Kingdom", "GB", 98),
  refAirport("LGW", "London", "United Kingdom", "GB", 60),
  refAirport("YXU", "London", "Canada", "CA", 20),
  refAirport("VLC", "Valencia", "Spain", "ES", 35),
  refAirport("VLN", "Valencia", "Venezuela", "VE", 15),
  refAirport("HER", "Heraklion", "Greece", "GR", 35, "Crete Island"),
  refAirport("CHQ", "Chania", "Greece", "GR", 35, "Souda"),
  refAirport("JSH", "Sitia", "Greece", "GR", 15, "Crete"),
  refAirport("JTR", "Santorini", "Greece", "GR", 35),
  refAirport("SEZ", "Seychelles", "Seychelles", "SC", 35, "Point Larue | Mahé Island | Victoria | Mahé"),
  refAirport("YYJ", "Victoria", "Canada", "CA", 35),
  refAirport("VCT", "Victoria", "United States", "US", 15),
  refAirport("HND", "Tokyo", "Japan", "JP", 94),
  refAirport("NRT", "Tokyo", "Japan", "JP", 86),
  refAirport("KIX", "Osaka", "Japan", "JP", 35, "OSA"),
  refAirport("ITM", "Osaka", "Japan", "JP", 35, "OSA | Itami"),
  refAirport("IST", "Istanbul", "Turkey", "TR", 90),
];

const deps = (calls: string[] = [], site = siteFixture()): SiteDeps => ({
  fetch: fakeSiteFetch(site, calls),
  userAgent: "BBCClub/test",
  signal: new AbortController().signal,
  clock: fakeClock(),
});

describe("reading the site", () => {
  it("dollars: whole and positive, from a number or a numeric string", () => {
    expect(dollars(788)).toBe(788);
    expect(dollars("1250")).toBe(1250);
    expect(dollars(1082.6)).toBe(1083);
    expect(dollars(0)).toBeNull();
    expect(dollars(-5)).toBeNull();
    expect(dollars("")).toBeNull();
    expect(dollars("n/a")).toBeNull();
    expect(dollars(null)).toBeNull();
  });

  it("reads regions → countries → cities, then each city's page, with the club's User-Agent", async () => {
    const calls: string[] = [];
    const seen: string[] = [];
    const site = siteFixture();
    const read = await readSite({
      ...deps(calls, site),
      fetch: async (url, init) => {
        seen.push(String((init?.headers as Record<string, string>)["User-Agent"]));
        return fakeSiteFetch(site, calls)(url, init);
      },
    });
    expect(read.cities.map((c) => c.id).sort((a, b) => a - b)).toEqual([23, 236, 283, 858, 947, 1153, 1506]);
    expect(read.failed).toEqual([]);
    expect([...read.promoted]).toEqual([283]);
    const london = read.cities.find((c) => c.id === 23)!;
    expect(london).toMatchObject({ name: "London", country: "United Kingdom", region: "Europe" });
    expect(london.deals[0]).toEqual({ id: 54, from: "New York", price: 788, publishedPrice: 2288 });
    expect(london.deals.find((d) => d.from === "Boston")?.price).toBeNull();
    // 1 list + 1 home page + 3 regions + 5 countries + 7 cities.
    expect(calls.length).toBe(17);
    expect(new Set(seen)).toEqual(new Set(["BBCClub/test"]));
  });

  it("a city that does not answer is listed as failed; a country that does not answer stops the read", async () => {
    const site = siteFixture();
    site.broken = [858];
    const read = await readSite(deps([], site));
    expect(read.failed).toEqual([858]);
    expect(read.cities.some((c) => c.id === 858)).toBe(false);

    site.broken = [2001];
    await expect(readSite(deps([], site))).rejects.toBeInstanceOf(SiteError);
  });

  it("inPool keeps the order, never runs more than n at once, and starts nothing after a failure", async () => {
    let running = 0;
    let most = 0;
    const out = await inPool([5, 1, 4, 2, 3], 2, async (x) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, x));
      running -= 1;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(most).toBe(2);

    const started: number[] = [];
    await expect(
      inPool([1, 2, 3, 4, 5, 6], 1, async (x) => {
        started.push(x);
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });

  it("a photo answers as an image (yes), is gone or not an image (no), or could not be asked (unknown)", async () => {
    const site = siteFixture();
    site.missingImages = ["bestDeals/858/image/victoria.jpg"];
    const d = deps([], site);
    const url = `${SITE_STORAGE}bestDeals/23/image/london01.jpg`;
    expect(await imageCheck(d, url)).toBe("yes");
    expect(await imageCheck(d, `${SITE_STORAGE}bestDeals/858/image/victoria.jpg`)).toBe("no");
    const html: SiteDeps = {
      ...d,
      fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    };
    expect(await imageCheck(html, url)).toBe("no");
    for (const status of [503, 500, 403, 408, 429]) {
      const failing: SiteDeps = { ...d, fetch: async () => new Response("busy", { status }) };
      expect(`${status} ${await imageCheck(failing, url)}`).toBe(`${status} unknown`);
    }
    const gone: SiteDeps = { ...d, fetch: async () => new Response("gone", { status: 410 }) };
    expect(await imageCheck(gone, url)).toBe("no");
    const down: SiteDeps = { ...d, fetch: async () => Promise.reject(new Error("ECONNRESET")) };
    expect(await imageCheck(down, url)).toBe("unknown");
    const stopped = new AbortController();
    stopped.abort(new Error("job timeout"));
    await expect(imageCheck({ ...down, signal: stopped.signal }, url)).rejects.toThrow("job timeout");
  });

  it("the site's address: buybusinessclass.com; its photos' former address is still the site's", () => {
    expect(SITE_API).toBe("https://buybusinessclass.com");
    expect(SITE_STORAGE).toBe("https://buybusinessclass.com/storage/");
    expect(LEGACY_SITE_STORAGE).toBe("https://weba.buybusinessclass.com/storage/");
    expect(SITE_STORAGE_PREFIXES).toEqual([SITE_STORAGE, LEGACY_SITE_STORAGE]);
  });

  it("a city's page: the first of its bloodline is the region, the last the city, the one before it the country", () => {
    const page = (bloodline: string[]) => ({
      type: "city" as const,
      image: null,
      bestDeals: [],
      selector: { bloodline: bloodline.map((name, i) => ({ id: i + 1, name })) },
    });
    const london = { region: "Europe", country: "United Kingdom", name: "London" };
    expect(toSiteCity(23, page(["Europe", "United Kingdom", "London"]))).toMatchObject(london);
    expect(toSiteCity(23, page(["Europe", "British Isles", "United Kingdom", "London"]))).toMatchObject(london);
    expect(toSiteCity(23, page(["Europe", "London"]))).toBeNull();
  });
});

describe("reading the site at its rate limit (ADR-IMPL-062)", () => {
  type Start = { t: number; url: string };
  /** The site as `fetch`, noting when each request starts by `clock`; `answer` may answer first. */
  const timedSite = (
    clock: ReturnType<typeof fakeClock>,
    starts: Start[],
    answer: (url: string) => Response | null = () => null,
  ): SiteDeps => {
    const site = fakeSiteFetch(siteFixture());
    return {
      fetch: async (url, init) => {
        starts.push({ t: clock.now(), url });
        return answer(url) ?? site(url, init);
      },
      userAgent: "BBCClub/test",
      signal: new AbortController().signal,
      clock,
    };
  };

  it("the pacer: starts never closer than the gap, whichever worker asks; a hold keeps every worker back", async () => {
    const clock = fakeClock();
    const pacer = sitePacer(clock, 600);
    const signal = new AbortController().signal;
    const starts: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map(async () => {
        await pacer.wait(signal);
        starts.push(clock.now());
      }),
    );
    expect(starts).toEqual([0, 600, 1200, 1800, 2400]);
    pacer.hold(30_000);
    await Promise.all([pacer.wait(signal), pacer.wait(signal)]);
    expect(clock.now()).toBe(2400 + 30_000 + 600);

    const stopped = new AbortController();
    stopped.abort(new Error("job timeout"));
    await expect(pacer.wait(stopped.signal)).rejects.toThrow("job timeout");
  });

  it("the system clock's sleep ends early, with the signal's reason, when the job is stopped", async () => {
    const stop = new AbortController();
    const started = Date.now();
    const sleeping = systemClock.sleep(10_000, stop.signal);
    stop.abort(new Error("job timeout"));
    await expect(sleeping).rejects.toThrow("job timeout");
    await expect(systemClock.sleep(10_000, stop.signal)).rejects.toThrow("job timeout");
    expect(Date.now() - started).toBeLessThan(1_000);
    await systemClock.sleep(5, new AbortController().signal);
  });

  it("starts one API request every 600 ms across the pool of four, in order, at the site's address", async () => {
    const clock = fakeClock();
    const starts: Start[] = [];
    const read = await readSite(timedSite(clock, starts));
    expect(read.cities).toHaveLength(7);
    // 1 list + 1 home page + 3 regions + 5 countries + 7 cities, each 600 ms after the one before.
    expect(starts.map((s) => s.t)).toEqual(Array.from({ length: 17 }, (_, i) => i * API_GAP_MS));
    expect(starts.every((s) => s.url.startsWith(`${SITE_API}/api/bestDeals/`))).toBe(true);
  });

  it("photo checks are not paced: they keep their own four at a time", async () => {
    const clock = fakeClock();
    const starts: Start[] = [];
    const d = timedSite(clock, starts);
    await Promise.all([1, 2, 3].map(() => imageCheck(d, `${SITE_STORAGE}bestDeals/23/image/london01.jpg`)));
    expect(starts.map((s) => s.t)).toEqual([0, 0, 0]);
  });

  it("a 429 holds every worker for what Retry-After asks, then that page is asked once more", async () => {
    const clock = fakeClock();
    const starts: Start[] = [];
    let refused = 0;
    const read = await readSite(
      timedSite(clock, starts, (url) =>
        url.endsWith("getOne?id=858") && refused++ === 0
          ? new Response("slow down", { status: 429, headers: { "retry-after": "30" } })
          : null,
      ),
    );
    expect(read.failed).toEqual([]);
    expect(read.cities).toHaveLength(7);
    expect(starts).toHaveLength(18);
    const first = starts.findIndex((s) => s.url.endsWith("getOne?id=858"));
    const again = starts.findLastIndex((s) => s.url.endsWith("getOne?id=858"));
    expect(again).toBeGreaterThan(first);
    // Nothing starts while the site asks to wait: the next request, whichever, comes 30 s later or more.
    expect(starts[first + 1]!.t - starts[first]!.t).toBeGreaterThanOrEqual(30_000);
    expect(starts[again]!.t - starts[first]!.t).toBeGreaterThanOrEqual(30_000);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!.t - starts[i - 1]!.t).toBeGreaterThanOrEqual(API_GAP_MS);
  });

  it("a second 429 on one page ends the read with a SiteError naming the page — a region's or a city's", async () => {
    for (const page of ["getOne?id=858", "getOne?id=603", "getAllDeals"]) {
      const clock = fakeClock();
      const starts: Start[] = [];
      const err = await readSite(
        timedSite(clock, starts, (url) => (url.endsWith(page) ? new Response("no", { status: 429 }) : null)),
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SiteError);
      expect(err).toMatchObject({ page, status: 429 });
      const asked = starts.filter((s) => s.url.endsWith(page));
      expect(asked).toHaveLength(2);
      // No Retry-After: a minute.
      expect(asked[1]!.t - asked[0]!.t).toBeGreaterThanOrEqual(60_000);
      // The workers still waiting their turn stop with the read: nothing more is asked once it has failed.
      const after = starts.length;
      for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
      expect(starts.length).toBe(after);
    }
  });

  it("Retry-After: seconds or an HTTP date; a minute without a readable one; never more than two", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(retryAfterMs("30", now)).toBe(30_000);
    expect(retryAfterMs(" 0 ", now)).toBe(0);
    expect(retryAfterMs(null, now)).toBe(60_000);
    expect(retryAfterMs("", now)).toBe(60_000);
    expect(retryAfterMs("soon", now)).toBe(60_000);
    expect(retryAfterMs("1.5", now)).toBe(60_000);
    expect(retryAfterMs("600", now)).toBe(120_000);
    expect(retryAfterMs("Sun, 25 Oct 2026 12:00:45 GMT", now)).toBe(45_000);
    expect(retryAfterMs("Sun, 25 Oct 2026 11:00:00 GMT", now)).toBe(0);
    expect(retryAfterMs("Mon, 26 Oct 2026 12:00:00 GMT", now)).toBe(120_000);
  });
});

describe("finding the airports", () => {
  const index = indexAirports(AIRPORTS);
  const city = (id: number, name: string, country: string) => ({ id, name, country });

  it("a name inside the site's country: London is not London, Ontario; Valencia is Spain's", () => {
    expect(cityAirports(city(23, "London", "United Kingdom"), index)).toEqual(["LHR", "LGW"]);
    expect(cityAirports(city(947, "Valencia", "Spain"), index)).toEqual(["VLC"]);
  });

  it("Victoria, the Seychelles' capital, through the search term of its airport", () => {
    expect(cityAirports(city(858, "Victoria", "Seychelles"), index)).toEqual(["SEZ"]);
  });

  it("a country the site names differently (Turkiye) still matches; one country's city needs no country", () => {
    expect(cityAirports(city(459, "Istanbul", "Turkiye"), index)).toEqual(["IST"]);
    expect(cityAirports(city(283, "Tokyo", "Nippon"), index)).toEqual(["HND", "NRT"]);
  });

  it("the listed exceptions: Crete's three airports, Heraklion first; Kyoto has none", () => {
    expect(cityAirports(city(1153, "Crete", "Greece"), index)).toEqual(["HER", "CHQ", "JSH"]);
    expect(cityAirports(city(1506, "Kyoto", "Japan"), index)).toBeNull();
  });

  it("a name with no airport, or one in several countries none of them the site's, is not guessed", () => {
    expect(cityAirports(city(9999, "Atlantis", "Greece"), index)).toBeNull();
    expect(cityAirports(city(9998, "Victoria", "Australia"), index)).toBeNull();
  });

  it("US cities: a metro area's airports, else the busiest one", () => {
    expect(originAirports("New York ", index)).toEqual(["JFK", "EWR", "LGA"]);
    expect(originAirports("Chicago", index)).toEqual(["ORD", "MDW"]);
    expect(originAirports("Jacksonville", index)).toEqual(["JAX"]);
    expect(originAirports("Los Angeles", index)).toEqual(["LAX"]);
    expect(originAirports("Atlantis", index)).toEqual([]);
  });

  it("whose photo the page shows: its own folder, else borrowed; an odd path is no photo", () => {
    expect(imageOf({ id: 23, image: "bestDeals/23/image/london01.jpg" })).toEqual({
      kind: "own",
      path: "bestDeals/23/image/london01.jpg",
    });
    expect(imageOf({ id: 1153, image: "bestDeals/236/image/c55d6ac2santorini.jpg" }).kind).toBe("borrowed");
    expect(imageOf({ id: 23, image: "bestDeals/23/image/LONDON.JPG" }).kind).toBe("own");
    expect(imageOf({ id: 23, image: "bestDeals/23/image/../../etc/passwd" }).kind).toBe("odd");
    expect(imageOf({ id: 23, image: "https://evil.test/x.jpg" }).kind).toBe("odd");
    expect(imageOf({ id: 23, image: null }).kind).toBe("none");
  });
});

describe("the site's 154 cities against the reference airports", () => {
  const reference = parseReference(readFileSync(REFERENCE_TSV, "utf8")).map((a) => ({
    code: a.code,
    city: a.city,
    country: a.country,
    countryCode: a.countryCode,
    searchTerms: a.searchTerms ?? null,
    popularity: a.popularity ?? 0,
  }));
  const plan = planSite(
    {
      promoted: new Set(),
      failed: [],
      cities: SITE_CITIES.map(([id, name, country]) => ({ id, name, country, region: "", image: null, deals: [] })),
    },
    reference,
  );
  const main = new Map(plan.places.map((p) => [p.cmsId, p.airport]));

  it("all but Kyoto find their airports, and no main airport is left to a tie", () => {
    expect(plan.places.length).toBe(153);
    expect(plan.unmapped.map((c) => c.name)).toEqual(["Kyoto"]);
    expect(plan.ties).toEqual([]);
  });

  it("the main airport is the one a quote would name", () => {
    const expected: Record<number, string> = {
      23: "LHR",
      8: "CDG",
      283: "HND",
      290: "KIX",
      1282: "OTP",
      527: "AMM",
      1140: "TFS",
      1490: "TFU",
      436: "CMB",
      996: "GLA",
      1312: "TPE",
      858: "SEZ",
      702: "MEL",
      835: "SCL",
      1553: "BLR",
      388: "SGN",
      622: "JRO",
      1153: "HER",
    };
    for (const [id, code] of Object.entries(expected)) expect(`${id} ${main.get(Number(id))}`).toBe(`${id} ${code}`);
  });
});

describe("the night's snapshot", () => {
  it("places, routes per US airport, what could not be placed — and Crete keeps Wikimedia", async () => {
    const plan = planSite(await readSite(deps()), AIRPORTS);

    expect(plan.places.map((p) => [p.cmsId, p.airport, p.airports, p.promoted, p.image])).toEqual([
      [23, "LHR", ["LHR", "LGW"], false, "bestDeals/23/image/london01.jpg"],
      [236, "JTR", ["JTR"], false, "bestDeals/236/image/c55d6ac2santorini.jpg"],
      [283, "HND", ["HND", "NRT"], true, "bestDeals/283/image/tokyo.jpg"],
      [858, "SEZ", ["SEZ"], false, "bestDeals/858/image/victoria.jpg"],
      [947, "VLC", ["VLC"], false, "bestDeals/947/image/valencia.webp"],
      [1153, "HER", ["HER", "CHQ", "JSH"], false, null],
    ]);
    expect(plan.unmapped).toEqual([{ id: 1506, name: "Kyoto", country: "Japan" }]);
    expect(plan.borrowed).toEqual([{ id: 1153, name: "Crete", image: "bestDeals/236/image/c55d6ac2santorini.jpg" }]);
    expect(plan.odd).toEqual([]);
    expect(plan.unknownOrigins).toEqual(["Atlantis"]);

    const london = plan.routes.filter((r) => r.cmsId === 23).map((r) => [r.routeFrom, r.price, r.publishedPrice]);
    expect(london).toEqual([
      ["JFK", 788, 2288],
      ["EWR", 788, 2288],
      ["LGA", 788, 2288],
      ["ORD", 1250, 2258],
      ["MDW", 1250, 2258],
      ["JAX", 1083, 1740],
    ]);
    // A price without a number (Boston) is no route.
    expect(plan.routes.some((r) => r.cmsId === 23 && r.price === null)).toBe(false);
  });

  it("two deals landing on one airport keep the lower price", () => {
    const plan = planSite(
      {
        promoted: new Set(),
        failed: [],
        cities: [
          {
            id: 23,
            name: "London",
            country: "United Kingdom",
            region: "Europe",
            image: null,
            deals: [
              { id: 1, from: "New York", price: 900, publishedPrice: null },
              { id: 2, from: "New York ", price: 800, publishedPrice: 1000 },
            ],
          },
        ],
      },
      AIRPORTS,
    );
    expect(plan.routes.find((r) => r.routeFrom === "JFK")).toMatchObject({ deal: 2, price: 800, publishedPrice: 1000 });
    expect(plan.routes.filter((r) => r.routeFrom === "JFK")).toHaveLength(1);
  });
});
