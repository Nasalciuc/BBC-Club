/**
 * The company's site as one read of it on 25 Oct 2026 found it (ADR-IMPL-067): its 7 regions, 78 countries and 154
 * cities, each city's photo path and the US cities its deals leave from (`New York `, trailing space and all) — the
 * structure of the saved answers, never their prices. Every price here is made up from the deal's id (D13: no company
 * price in the repository): whole dollars ending in 01, and an "Old Price" a thousand above it.
 * `site-recorded.json` holds the structure; fakeSiteFetch (site.fixture.ts) answers it as the site's API does.
 */
import recorded from "./site-recorded.json";
import type { FakeSite } from "./site.fixture";

/** A made-up "Price Today" for a deal: never the site's. */
export const madeUpPrice = (dealId: number) => 1001 + 100 * ((dealId * 7) % 27);
/** A made-up "Old Price": stored by the sync, never served. */
export const madeUpOldPrice = (dealId: number) => madeUpPrice(dealId) + 1000;

/** The recorded read, answered with made-up prices. A fresh copy each call: a test may change it. */
export function recordedSite(): FakeSite {
  return {
    promoted: [...recorded.promoted],
    regions: recorded.regions.map((region) => ({
      id: region.id,
      name: region.name,
      countries: region.countries.map((country) => ({
        id: country.id,
        name: country.name,
        cities: country.cities.map((city) => ({
          id: city.id,
          name: city.name,
          image: city.image,
          deals: city.deals.map((entry) => {
            const [id, name] = entry as [number, string];
            return { id, name, price: madeUpPrice(id), old: madeUpOldPrice(id) };
          }),
        })),
      })),
    })),
  };
}
