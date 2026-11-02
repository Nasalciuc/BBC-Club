/** ADR-IMPL-083: what a tap on the globe shows for the server's answer — the town, three airports, never home's metro. */
import { describe, expect, it } from "bun:test";
import type { NearAirportVM } from "@bbc/shared/api/v1/fares";

import { cityToOpen } from "./open-city";
import { placesTap, pointToAsk, tapTitle } from "./places-near-logic";

const airport = (code: string, city: string, lat: number, lng: number, km: number): NearAirportVM => ({
  code,
  city,
  name: `${city} International Airport`,
  countryCode: "RO",
  lat,
  lng,
  km,
});

const IAS = airport("IAS", "Iași", 47.1796, 27.6214, 69.8);
const SCV = airport("SCV", "Suceava", 47.6875, 26.3541, 118.4);
const RMO = { ...airport("RMO", "Chișinău", 46.9277, 28.9317, 120.6), countryCode: "MD" };
const ODS = { ...airport("ODS", "Odesa", 46.4268, 30.6765, 245.2), countryCode: "UA" };
const balti = { lat: 47.76, lng: 27.93 };
const town = { name: "Bălţi", countryCode: "MD", km: 0.4 };

describe("tapTitle", () => {
  it("names the town and its country, near it past 15 km, or the airports alone", () => {
    expect(tapTitle(town)).toBe("Bălţi, Moldova");
    expect(tapTitle({ ...town, km: 22 })).toBe("Near Bălţi, Moldova");
    expect(tapTitle(null)).toBe("Airports near there");
  });
});

describe("placesTap", () => {
  it("offers the three nearest airports with how far each is", () => {
    const what = placesTap({ locality: town, airports: [IAS, SCV, RMO, ODS] }, balti, null);
    expect(what).toEqual({
      kind: "choices",
      choices: {
        title: "Bălţi, Moldova",
        airports: [
          { ...IAS, distance: "70 km" },
          { ...SCV, distance: "120 km" },
          { ...RMO, distance: "120 km" },
        ],
      },
    });
  });

  it("leaves out the member's own airport and its metro, and offers the next", () => {
    // A member from Chișinău taps Bălți: Chișinău is home, so the next airport comes third.
    const home = { code: "RMO", lat: RMO.lat, lng: RMO.lng };
    const what = placesTap({ locality: town, airports: [IAS, SCV, RMO, ODS] }, balti, home);
    expect(what.kind === "choices" && what.choices.airports.map((a) => a.code)).toEqual(["IAS", "SCV", "ODS"]);
  });

  it("answers home on the member's own city, and nothing near over the sea", () => {
    const home = { code: "RMO", lat: RMO.lat, lng: RMO.lng };
    const chisinau = { lat: 47.02, lng: 28.84 };
    expect(placesTap({ locality: town, airports: [RMO] }, chisinau, home)).toEqual({ kind: "answer", answer: "home" });
    expect(placesTap({ locality: null, airports: [] }, { lat: -40, lng: -120 }, home)).toEqual({
      kind: "answer",
      answer: "none",
    });
    // Nothing left far from home: nothing near there, never "your home airport".
    expect(placesTap({ locality: town, airports: [RMO] }, balti, home)).toEqual({ kind: "answer", answer: "none" });
  });

  it("opens a chosen airport as a pin's tap opens it", () => {
    expect(cityToOpen("IAS", [], IAS)).toEqual({
      code: "IAS",
      city: "Iași",
      name: "Iași International Airport",
      countryCode: "RO",
      lat: IAS.lat,
      lng: IAS.lng,
    });
  });
});

describe("pointToAsk", () => {
  it("sends the point to two decimals, about a kilometre", () => {
    expect(pointToAsk({ lat: 47.763142, lng: 27.929321 })).toEqual({ lat: "47.76", lng: "27.93" });
    expect(pointToAsk({ lat: -33.86785, lng: 151.20732 })).toEqual({ lat: "-33.87", lng: "151.21" });
  });
});
