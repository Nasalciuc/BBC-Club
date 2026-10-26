/** ADR-IMPL-067: which of the site's deals a member sees — the origins as metros, nearest first, one deal per city. */
import { describe, expect, it } from "bun:test";
import { metrosFor, originMetros, pickDeals, type DealOrigin } from "../../src/application/site-deals";

// Where the airports are, as the reference has them (rounded).
const JFK = { code: "JFK", city: "New York", lat: 40.64, lng: -73.78 };
const EWR = { code: "EWR", city: "Newark", lat: 40.69, lng: -74.17 };
const LGA = { code: "LGA", city: "New York", lat: 40.78, lng: -73.87 };
const BOS = { code: "BOS", city: "Boston", lat: 42.36, lng: -71.01 };
const SFO = { code: "SFO", city: "San Francisco", lat: 37.62, lng: -122.37 };
const LAX = { code: "LAX", city: "Los Angeles", lat: 33.94, lng: -118.41 };
const IAD = { code: "IAD", city: "Washington", lat: 38.94, lng: -77.46 };
const BWI = { code: "BWI", city: "Baltimore", lat: 39.18, lng: -76.67 };
const SEA = { code: "SEA", lat: 47.45, lng: -122.31 };
const HPN = { code: "HPN", lat: 41.07, lng: -73.71 };
const ORIGINS: DealOrigin[] = [EWR, BOS, LGA, SFO, JFK, LAX, BWI, IAD];

describe("originMetros", () => {
  it("groups a metro the site names, home's own first at 0 km, then by distance", () => {
    const metros = originMetros({ code: "EWR", lat: EWR.lat, lng: EWR.lng }, ORIGINS);
    expect(metros.map((m) => [m.city, m.airports])).toEqual([
      ["New York", ["EWR", "JFK", "LGA"]], // the member's own airport first, then as the site's metro lists them
      ["Washington", ["IAD", "BWI"]],
      ["Boston", ["BOS"]],
      ["Los Angeles", ["LAX"]],
      ["San Francisco", ["SFO"]],
    ]);
    expect(metros[0]!.km).toBe(0);
    expect(metros[1]!.km).toBeGreaterThan(250); // Baltimore, the metro's nearest airport
    expect(metros[1]!.km).toBeLessThan(metros[2]!.km);
  });

  it("names a metro as the site does, not as its first airport's city (Newark is New York, Baltimore Washington)", () => {
    const metros = originMetros(SEA, [EWR, BWI]);
    expect(metros.map((m) => m.city).sort()).toEqual(["New York", "Washington"]);
  });

  it("a home the site sells nothing from: no metro at 0 km, the nearest first", () => {
    const metros = originMetros(SEA, ORIGINS);
    expect(metros[0]).toMatchObject({ city: "San Francisco", airports: ["SFO"] });
    expect(metros[0]!.km).toBeGreaterThan(1000);
    expect(metros.map((m) => m.city)).toEqual(["San Francisco", "Los Angeles", "Washington", "New York", "Boston"]);
    // A suburb of a metro: the metro, near but not its own.
    const plains = originMetros(HPN, ORIGINS);
    expect(plains[0]).toMatchObject({ city: "New York", airports: ["JFK", "EWR", "LGA"] });
    expect(plains[0]!.km).toBeGreaterThan(0);
  });

  it("a member of a metro whose own airport has no deal still has the metro at 0 km", () => {
    expect(originMetros({ code: "DCA", lat: 38.85, lng: -77.04 }, ORIGINS)[0]).toMatchObject({
      city: "Washington",
      km: 0,
    });
    expect(originMetros({ code: "JFK", lat: JFK.lat, lng: JFK.lng }, [])).toEqual([]);
  });
});

const deal = (routeFrom: string, cmsId: number, airports: string[], to = { lat: 51.47, lng: -0.45 }) => ({
  routeFrom,
  cmsId,
  airports,
  to,
});

describe("pickDeals", () => {
  const home = { code: "JFK", lat: JFK.lat, lng: JFK.lng };
  const metros = originMetros(home, ORIGINS);

  it("the nearest metro's deals first, in the order they come; a city once only, the nearest origin's", () => {
    const candidates = [
      deal("BOS", 23, ["LHR", "LGW"]), // London from Boston: New York has it too — New York's
      deal("EWR", 23, ["LHR", "LGW"]),
      deal("JFK", 23, ["LHR", "LGW"]),
      deal("LGA", 23, ["LHR", "LGW"]),
      deal("BOS", 858, ["SEZ"]), // only Boston lists the Seychelles
      deal("JFK", 283, ["HND", "NRT"]),
      deal("LAX", 9283, ["NRT"], { lat: 35.77, lng: 140.39 }), // a second Tokyo page, on Narita: Tokyo once
    ];
    const picked = pickDeals(home, metros, candidates, 10);
    expect(picked.map(({ deal: d, metro }) => [d.routeFrom, d.cmsId, metro.city])).toEqual([
      ["JFK", 23, "New York"],
      ["JFK", 283, "New York"],
      ["BOS", 858, "Boston"],
    ]);
  });

  it("from the metro's preferred airport: home, else the first the metro lists", () => {
    const candidates = [deal("LGA", 23, ["LHR"]), deal("EWR", 23, ["LHR"])];
    expect(pickDeals(home, metros, candidates, 5).map((p) => p.deal.routeFrom)).toEqual(["EWR"]);
    const seattle = originMetros(SEA, ORIGINS);
    expect(pickDeals(SEA, seattle, candidates, 5).map((p) => p.deal.routeFrom)).toEqual(["EWR"]);
  });

  it("never the member's own city, never past the limit, nothing from an origin it does not rank", () => {
    const candidates = [
      deal("JFK", 1, ["EWR"], { lat: EWR.lat, lng: EWR.lng }), // under 100 km from home
      deal("BOS", 2, ["JFK"], { lat: JFK.lat, lng: JFK.lng }), // home itself
      deal("JFK", 3, ["CDG"]),
      deal("JFK", 4, ["FCO"]),
      deal("ZZZ", 5, ["MAD"]),
    ];
    expect(pickDeals(home, metros, candidates, 10).map((p) => p.deal.cmsId)).toEqual([3, 4]);
    expect(pickDeals(home, metros, candidates, 1).map((p) => p.deal.cmsId)).toEqual([3]);
    expect(pickDeals(home, metros, candidates, 0)).toEqual([]);
  });
});

describe("metrosFor", () => {
  it("as many nearest metros as hold the limit between them, a metro's airports counted once", () => {
    const metros = originMetros({ code: "BOS", lat: BOS.lat, lng: BOS.lng }, ORIGINS);
    const counts = new Map([
      ["BOS", 5],
      ["JFK", 153],
      ["EWR", 153],
      ["LGA", 153],
      ["IAD", 97],
    ]);
    expect(metrosFor(metros, counts, 24)).toBe(2); // Boston's 5, New York's 153
    expect(metrosFor(metros, counts, 5)).toBe(1);
    expect(metrosFor(metros, counts, 1000)).toBe(metros.length);
    expect(metrosFor([], counts, 24)).toBe(0);
  });
});
