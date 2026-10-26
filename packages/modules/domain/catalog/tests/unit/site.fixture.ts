/** A small copy of the company's site (ADR-IMPL-045), answered the way its API answers: regions → countries → cities,
 *  a city's page with its photo, its prices from US cities, region › country › city. Made-up prices. */
import type { Fetch } from "../../src/application/place-photo-sources";
import { SITE_API, type SiteClock } from "../../src/application/site-cms";

type Deal = { id: number; name: string; price: number | string | null; old?: number | null };
export type FakeCity = { id: number; name: string; image: string | null; deals: Deal[] };
export type FakeCountry = { id: number; name: string; cities: FakeCity[] };
export type FakeRegion = { id: number; name: string; countries: FakeCountry[] };
export type FakeSite = {
  regions: FakeRegion[];
  /** The home page's cities (getMain). */
  promoted: number[];
  /** Pages answered with HTTP 500. */
  broken?: number[];
  /** Photos answered with 404. */
  missingImages?: string[];
};

const siteAnswer = (data: unknown) =>
  new Response(JSON.stringify({ responseCode: { responseCode: "1" }, data }), {
    headers: { "content-type": "application/json" },
  });

export function siteFixture(): FakeSite {
  return {
    promoted: [283],
    regions: [
      {
        id: 1,
        name: "Europe",
        countries: [
          {
            id: 21,
            name: "United Kingdom",
            cities: [
              {
                id: 23,
                name: "London",
                image: "bestDeals/23/image/london01.jpg",
                deals: [
                  { id: 54, name: "New York ", price: 801, old: 2101 },
                  { id: 55, name: "Chicago", price: "1301", old: 2401 },
                  { id: 1632, name: "Jacksonville", price: 1101, old: 1801 },
                  { id: 1699, name: "Atlantis", price: 999, old: null },
                  { id: 1700, name: "Boston", price: null, old: 1601 },
                ],
              },
            ],
          },
          {
            id: 3,
            name: "Spain",
            cities: [
              {
                id: 947,
                name: "Valencia",
                image: "bestDeals/947/image/valencia.webp",
                deals: [{ id: 801, name: "New York", price: 900, old: 1900 }],
              },
            ],
          },
          {
            id: 197,
            name: "Greece",
            cities: [
              {
                id: 236,
                name: "Santorini",
                image: "bestDeals/236/image/c55d6ac2santorini.jpg",
                deals: [{ id: 802, name: "New York", price: 1100, old: 2100 }],
              },
              {
                id: 1153,
                name: "Crete",
                image: "bestDeals/236/image/c55d6ac2santorini.jpg",
                deals: [{ id: 803, name: "New York", price: 1200, old: 2200 }],
              },
            ],
          },
        ],
      },
      {
        id: 603,
        name: "Africa",
        countries: [
          {
            id: 2001,
            name: "Seychelles",
            cities: [
              {
                id: 858,
                name: "Victoria",
                image: "bestDeals/858/image/victoria.jpg",
                deals: [{ id: 804, name: "New York", price: 1500, old: 2500 }],
              },
            ],
          },
        ],
      },
      {
        id: 281,
        name: "Asia",
        countries: [
          {
            id: 2002,
            name: "Japan",
            cities: [
              {
                id: 283,
                name: "Tokyo",
                image: "bestDeals/283/image/tokyo.jpg",
                deals: [
                  { id: 1508, name: "New York", price: 1901, old: 2901 },
                  { id: 289, name: "Los Angeles", price: 1401, old: 2801 },
                ],
              },
              {
                id: 1506,
                name: "Kyoto",
                image: "bestDeals/1506/image/kyoto.jpg",
                deals: [{ id: 805, name: "New York", price: 1300, old: 2300 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Time for the site's pacing that never really waits: `sleep` moves the clock on to the moment it was asked to wait for
 * (never back), so a night of 600-ms gaps takes no time and each request's start can be read off `now()`. A sleeper
 * wakes only after every answer already on its way is read (the site answers well inside the gap).
 */
export function fakeClock(start = 0): SiteClock & { slept: number[] } {
  let t = start;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms, signal) => {
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      slept.push(ms);
      const until = t + ms;
      await new Promise((resolve) => setImmediate(resolve));
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      t = Math.max(t, until);
    },
  };
}

/** The site as a `fetch` at its address (SITE_API): the API's pages, HEAD for photos. Counts every request in `calls`. */
export function fakeSiteFetch(site: FakeSite, calls: string[] = []): Fetch {
  const regions = new Map(site.regions.map((r) => [r.id, r]));
  const countries = new Map(site.regions.flatMap((r) => r.countries.map((c) => [c.id, { region: r, country: c }])));
  const cities = new Map(
    site.regions.flatMap((r) =>
      r.countries.flatMap((c) => c.cities.map((city) => [city.id, { region: r, country: c, city }] as const)),
    ),
  );
  return async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const u = new URL(url);
    if (u.origin !== SITE_API) return new Response("not here", { status: 404 });
    if ((init?.method ?? "GET") === "HEAD") {
      const path = u.pathname.replace(/^\/storage\//, "");
      const missing = site.missingImages?.includes(path);
      return new Response(null, { status: missing ? 404 : 200, headers: { "content-type": "image/jpeg" } });
    }
    if (u.pathname === "/api/bestDeals/getAllDeals") {
      return siteAnswer(
        site.regions.map((r) => ({ id: r.id, name: r.name, image: null, price_today: 1000, type: "region" })),
      );
    }
    if (u.pathname === "/api/bestDeals/getMain") {
      return siteAnswer([
        ...site.regions.map((r) => ({ id: r.id, name: r.name, image: null, price_today: 1000, type: "region" })),
        ...site.promoted.map((id) => ({
          id,
          name: cities.get(id)?.city.name ?? "?",
          image: null,
          price_today: 1000,
          type: "city",
        })),
      ]);
    }
    if (u.pathname === "/api/bestDeals/getOne") {
      const id = Number(u.searchParams.get("id"));
      if (site.broken?.includes(id)) return new Response("oops", { status: 500 });
      const region = regions.get(id);
      if (region) {
        return siteAnswer({
          type: "region",
          image: null,
          bestDeals: region.countries.map((c) => ({ id: c.id, name: c.name, image: null, type: "country" })),
          selector: { bloodline: [{ id: region.id, name: region.name }], countries: [], cities: [] },
        });
      }
      const country = countries.get(id);
      if (country) {
        return siteAnswer({
          type: "country",
          image: null,
          bestDeals: country.country.cities.map((c) => ({ id: c.id, name: c.name, image: c.image, type: "city" })),
          selector: {
            bloodline: [
              { id: country.region.id, name: country.region.name },
              { id: country.country.id, name: country.country.name },
            ],
            countries: [],
            cities: [],
          },
        });
      }
      const city = cities.get(id);
      if (city) {
        return siteAnswer({
          type: "city",
          image: city.city.image,
          minPrice: { price_today: 1 },
          about: "{}",
          bestDeals: city.city.deals.map((d) => ({
            id: d.id,
            name: d.name,
            old_price: d.old ?? null,
            price_today: d.price,
            image: null,
            type: null,
          })),
          selector: {
            bloodline: [
              { id: city.region.id, name: city.region.name },
              { id: city.country.id, name: city.country.name },
              { id: city.city.id, name: city.city.name },
            ],
            countries: [],
            cities: [],
          },
        });
      }
      return new Response("missing", { status: 404 });
    }
    return new Response("missing", { status: 404 });
  };
}
