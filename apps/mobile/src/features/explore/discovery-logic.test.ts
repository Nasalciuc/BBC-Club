import { describe, expect, it } from "bun:test";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import {
  HOME_AIRPORT_MESSAGE,
  airportLine,
  airportName,
  deviceTimeZone,
  isHomeAirport,
  popularLabel,
  popularRows,
  popularState,
  withoutHome,
} from "./discovery-logic";

const a = (code: string, city: string): AirportVM => ({ code, city, name: city, countryCode: "XX", lat: 0, lng: 0 });
const POPULAR = [a("LHR", "London"), a("CDG", "Paris"), a("HND", "Tokyo"), a("DXB", "Dubai"), a("SIN", "Singapore")];

describe("popular from", () => {
  it("names the origin's city", () => {
    expect(popularLabel({ city: "New York" })).toBe("Popular from New York");
  });

  it("shows three, as 03 does, never the origin — a city searched lately stays (03: London under both)", () => {
    expect(popularRows(POPULAR, null).map((x) => x.code)).toEqual(["LHR", "CDG", "HND"]);
    expect(popularRows(POPULAR, a("LHR", "London")).map((x) => x.code)).toEqual(["CDG", "HND", "DXB"]);
    expect(popularRows([], null)).toEqual([]);
  });
});

describe("popularState — what stands under Search's field before typing (F011)", () => {
  it("a Home that failed shows its message with Try again, never skeletons for ever", () => {
    expect(popularState({ popular: 0, recent: 0, load: "failed" })).toBe("error");
    expect(popularState({ popular: 0, recent: 2, load: "failed" })).toBe("error");
  });

  it("skeletons only while Home loads; the cards once there are some", () => {
    expect(popularState({ popular: 0, recent: 0, load: "loading" })).toBe("skeleton");
    expect(popularState({ popular: 3, recent: 0, load: "ok" })).toBe("cards");
    // The popular list can come from the server's own list while Home is still on its way.
    expect(popularState({ popular: 3, recent: 0, load: "loading" })).toBe("cards");
  });

  it("Home answered without a popular destination: the hint, or the recent searches alone", () => {
    expect(popularState({ popular: 0, recent: 0, load: "ok" })).toBe("hint");
    expect(popularState({ popular: 0, recent: 1, load: "ok" })).toBe("none");
  });
});

describe("the member's own airport is never a destination (F013)", () => {
  const JFK = a("JFK", "New York");

  it("Search's airports and recent searches leave the home airport out", () => {
    expect(withoutHome([JFK, a("LGA", "New York"), a("LHR", "London")], JFK).map((x) => x.code)).toEqual([
      "LGA",
      "LHR",
    ]);
    const recent = [{ airport: JFK }, { airport: a("LHR", "London") }];
    expect(withoutHome(recent, JFK).map((r) => r.airport.code)).toEqual(["LHR"]);
    // No origin known yet: nothing is left out.
    expect(withoutHome([JFK], null)).toHaveLength(1);
  });

  it("a destination page opened on the home airport says so instead of searching it", () => {
    expect(isHomeAirport("JFK", JFK)).toBe(true);
    expect(isHomeAirport("LHR", JFK)).toBe(false);
    expect(isHomeAirport("JFK", null)).toBe(false);
    expect(HOME_AIRPORT_MESSAGE).toEqual({
      title: "That’s your home airport.",
      body: "Choose another city.",
    });
  });
});

describe("airportName", () => {
  it("calls the catalogue's name an airport where it does not say so (03)", () => {
    expect(airportName({ name: "Heathrow" })).toBe("Heathrow Airport");
    expect(airportName({ name: "John F Kennedy International" })).toBe("John F Kennedy International");
    expect(airportName({ name: "London City Airport" })).toBe("London City Airport");
    // 18: under `London`, the airport without its city.
    expect(airportName({ name: "London City Airport", city: "London" })).toBe("City Airport");
    expect(airportName({ name: "Gatwick", city: "London" })).toBe("Gatwick Airport");
    expect(airportName({ name: "London", city: "London" })).toBe("London Airport");
    expect(airportLine({ name: "Heathrow", code: "LHR" })).toBe("Heathrow Airport  ·  LHR");
  });

  it("keeps the city when what is left is only a generic word — never a bare `International`", () => {
    expect(airportName({ name: "Los Angeles International", city: "Los Angeles" })).toBe("Los Angeles International");
    expect(airportName({ name: "Long Beach International Airport", city: "Long Beach" })).toBe(
      "Long Beach International Airport",
    );
    expect(airportName({ name: "Bangor Airport", city: "Bangor" })).toBe("Bangor Airport");
    expect(airportName({ name: "Roanoke Regional Airport", city: "Roanoke" })).toBe("Roanoke Regional Airport");
    // A remainder that names the airport is kept without its city, as before.
    expect(airportName({ name: "London Heathrow Airport", city: "London" })).toBe("Heathrow Airport");
    expect(airportName({ name: "Heathrow Airport", city: "London" })).toBe("Heathrow Airport");
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
