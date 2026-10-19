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
    expect(destinationFromParams(href.params)).toEqual({
      airport: LHR,
      dates: { depart: "2026-11-12", return: "2026-11-19" },
    });
  });

  it("carry no dates when none were searched", () => {
    const href = destinationHref(LHR, null) as unknown as { params: Record<string, string> };
    expect(destinationFromParams(href.params)?.dates).toBeNull();
  });

  it("refuse params that do not name an airport", () => {
    expect(destinationFromParams({ code: "LHR" })).toBeNull();
    expect(destinationFromParams({ code: "LONDON", city: "London", country: "GB", lat: "51", lng: "0" })).toBeNull();
    expect(destinationFromParams({ code: "LHR", city: "London", country: "GB", lat: "x", lng: "0" })).toBeNull();
    expect(destinationFromParams({ code: "LHR", city: "London", country: "GB", lat: "95", lng: "0" })).toBeNull();
  });
});
