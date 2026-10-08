import { describe, expect, it } from "bun:test";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { deviceTimeZone, popularLabel, popularRows } from "./discovery-logic";

const a = (code: string, city: string): AirportVM => ({ code, city, name: city, countryCode: "XX", lat: 0, lng: 0 });
const POPULAR = [a("LHR", "London"), a("CDG", "Paris"), a("HND", "Tokyo"), a("DXB", "Dubai"), a("SIN", "Singapore")];

describe("popular from", () => {
  it("names the origin's city", () => {
    expect(popularLabel({ city: "New York" })).toBe("Popular from New York");
  });

  it("shows at most four, skipping recents and the origin", () => {
    expect(popularRows(POPULAR, [], null).map((x) => x.code)).toEqual(["LHR", "CDG", "HND", "DXB"]);
    expect(popularRows(POPULAR, [a("CDG", "Paris")], null).map((x) => x.code)).toEqual(["LHR", "HND", "DXB", "SIN"]);
    expect(popularRows(POPULAR, [], a("LHR", "London")).map((x) => x.code)).toEqual(["CDG", "HND", "DXB", "SIN"]);
    expect(popularRows([], [], null)).toEqual([]);
  });
});

describe("deviceTimeZone", () => {
  it("returns an IANA zone and nothing for UTC, an abbreviation or a failing runtime", () => {
    expect(deviceTimeZone(() => "Europe/Chisinau")).toBe("Europe/Chisinau");
    expect(deviceTimeZone(() => "UTC")).toBeNull();
    expect(deviceTimeZone(() => "EST")).toBeNull();
    expect(deviceTimeZone(() => undefined)).toBeNull();
    expect(
      deviceTimeZone(() => {
        throw new Error("no Intl");
      }),
    ).toBeNull();
    // The default resolver reads the runtime: a place, or null on a machine set to UTC (CI).
    const own = deviceTimeZone();
    expect(own === null || own.includes("/")).toBe(true);
  });
});
