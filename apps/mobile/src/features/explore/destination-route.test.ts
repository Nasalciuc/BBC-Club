import { describe, expect, it } from "bun:test";

import { destinationFromParams, destinationHref } from "./destination-route";

const LHR = { code: "LHR", city: "London", name: "Heathrow", countryCode: "GB", lat: 51.47, lng: -0.4543 };

describe("the destination's page params", () => {
  it("carry the airport and its dates there and back", () => {
    const href = destinationHref(LHR, { depart: "2026-11-12", return: "2026-11-19" }) as unknown as {
      pathname: string;
      params: Record<string, string>;
    };
    expect(href.pathname).toBe("/destination/[code]");
    expect(destinationFromParams(href.params, "2026-10-08")).toEqual({
      airport: LHR,
      dates: { depart: "2026-11-12", return: "2026-11-19" },
      origin: null,
    });
  });

  it("carry no dates when none were searched", () => {
    const href = destinationHref(LHR, null) as unknown as { params: Record<string, string> };
    expect(destinationFromParams(href.params)?.dates).toBeNull();
  });

  it("drop a departure that has passed — the destination opens with flexible dates (F006)", () => {
    const href = destinationHref(LHR, { depart: "2026-10-05", return: "2026-10-12" }) as unknown as {
      params: Record<string, string>;
    };
    expect(destinationFromParams(href.params, "2026-10-20")?.dates).toBeNull();
    expect(destinationFromParams(href.params, "2026-10-01")?.dates).toEqual({
      depart: "2026-10-05",
      return: "2026-10-12",
    });
  });

  it("carry the search's origin, so the page never loads all of Home to learn it (F104)", () => {
    const JFK = {
      code: "JFK",
      city: "New York",
      name: "John F Kennedy International",
      countryCode: "US",
      lat: 40.64,
      lng: -73.78,
    };
    const href = destinationHref(LHR, null, JFK) as unknown as { params: Record<string, string> };
    expect(destinationFromParams(href.params)?.origin).toEqual(JFK);
    // No origin given (a link, an older list): the page finds it from the profile instead.
    const bare = destinationHref(LHR, null) as unknown as { params: Record<string, string> };
    expect(destinationFromParams(bare.params)?.origin).toBeNull();
    expect(destinationFromParams({ ...href.params, fromLat: "x" })?.origin).toBeNull();
  });

  it("refuse params that do not name an airport", () => {
    expect(destinationFromParams({ code: "LHR" })).toBeNull();
    expect(destinationFromParams({ code: "LONDON", city: "London", country: "GB", lat: "51", lng: "0" })).toBeNull();
    expect(destinationFromParams({ code: "LHR", city: "London", country: "GB", lat: "x", lng: "0" })).toBeNull();
    expect(destinationFromParams({ code: "LHR", city: "London", country: "GB", lat: "95", lng: "0" })).toBeNull();
  });
});
