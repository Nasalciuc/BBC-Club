/**
 * A fare's trip and a destination's line (ADR-IMPL-056), both upgrade orders: an app built before them parses an answer
 * that has them, an app built with them parses an older server's answer (an OTA can land before a deploy), and a value
 * the app cannot read never breaks the fare or the airport around it.
 */
import { describe, expect, it } from "bun:test";

import { AirportVM, DestinationPinVM, FareVM, SearchResultVM } from "@bbc/shared/api/v1/fares";
import { fixture } from "@bbc/shared/fixture";
import { toAirportVM, toDestinationPin } from "../../src/application/to-fare-vm";
import { mapFa01 } from "./fa01-map";

const LINE = "Iconic sights, world-class culture and unforgettable experiences.";
const jfk = {
  code: "JFK",
  city: "New York",
  name: "John F Kennedy International",
  countryCode: "US",
  lat: 40.64,
  lng: -73.78,
};
const lhr = { code: "LHR", city: "London", name: "Heathrow", countryCode: "GB", lat: 51.47, lng: -0.45 };

describe("FareVM.trip — what a fare's price is for", () => {
  it("the mapper says the catalogue's trip: one way unless the row says round trip", () => {
    expect(FareVM.parse(mapFa01()).trip).toBe("one_way");
    expect(FareVM.parse(mapFa01({}, "round_trip")).trip).toBe("round_trip");
  });

  it("an app built before the trip parses a fare that has it, and drops it", () => {
    const older = FareVM.omit({ trip: true });
    expect(older.parse({ ...fixture.fares[0], trip: "round_trip" })).not.toHaveProperty("trip");
  });

  it("an app built with it reads an older server's fare: no trip, and the fare still lists", () => {
    const parsed = FareVM.parse(fixture.fares[0]);
    expect(parsed.trip).toBeUndefined();
    expect(parsed.id).toBe(fixture.fares[0]!.id);
  });

  it("reads both trips; one it does not know is none — the fare is not refused", () => {
    expect(FareVM.parse({ ...fixture.fares[0], trip: "round_trip" }).trip).toBe("round_trip");
    expect(FareVM.parse({ ...fixture.fares[0], trip: "one_way" }).trip).toBe("one_way");
    for (const odd of ["return", "multi_city", "", 2, null]) {
      const parsed = FareVM.parse({ ...fixture.fares[0], trip: odd });
      expect(parsed.trip).toBeUndefined();
      expect(parsed.price).toEqual(fixture.fares[0]!.price);
    }
  });
});

describe("AirportVM.description — a destination's one line under its city", () => {
  it("the mapper says the catalogue's line, or none — also for a row cached before the column", () => {
    const row = {
      code: "LHR",
      name: "Heathrow",
      city: "London",
      country: "United Kingdom",
      countryCode: "GB",
      region: "europe",
      lat: "51.470000",
      lng: "-0.454300",
      popularity: 98,
      tz: "Europe/London",
      searchTerms: null,
      description: LINE,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    expect(toAirportVM(row).description).toBe(LINE);
    expect(toAirportVM({ ...row, description: null }).description).toBeNull();
    // Redis keeps rows as JSON: one cached by the release before 0031 has no description at all.
    const cached = JSON.parse(JSON.stringify({ ...row, description: undefined })) as typeof row;
    expect("description" in cached).toBe(false);
    expect(toAirportVM(cached).description).toBeNull();
    const pin = { ...lhr, region: "europe", fromPrice: 4200 };
    expect(toDestinationPin({ ...pin, description: LINE }, false).description).toBe(LINE);
    expect(toDestinationPin(pin, false).description).toBeNull();
  });

  it("an app built before the line parses an airport, a pin and a search that have it, and drops it", () => {
    expect(AirportVM.omit({ description: true }).parse({ ...lhr, description: LINE })).not.toHaveProperty(
      "description",
    );
    const pin = { ...lhr, description: LINE, fromPrice: 4200, hasOffer: false, region: "europe" };
    expect(DestinationPinVM.omit({ description: true }).parse(pin)).not.toHaveProperty("description");
  });

  it("an app built with it reads an older server's airport: no line", () => {
    expect(AirportVM.parse(lhr).description).toBeUndefined();
    const search = SearchResultVM.parse({ from: jfk, to: lhr, items: [], offer: null });
    expect(search.to.description).toBeUndefined();
  });

  it("reads the line; a blank one or one it cannot read is none, and the airport still parses", () => {
    expect(AirportVM.parse({ ...lhr, description: LINE }).description).toBe(LINE);
    expect(AirportVM.parse({ ...lhr, description: ` ${LINE} ` }).description).toBe(LINE);
    expect(AirportVM.parse({ ...lhr, description: null }).description).toBeNull();
    for (const odd of ["", "   ", 7, { text: LINE }]) {
      const parsed = AirportVM.parse({ ...lhr, description: odd });
      expect(parsed.description).toBeNull();
      expect(parsed.city).toBe("London");
    }
    const search = SearchResultVM.parse({
      from: { ...jfk, description: 42 },
      to: { ...lhr, description: LINE },
      items: [],
      offer: null,
    });
    expect([search.from.description, search.to.description]).toEqual([null, LINE]);
  });
});
