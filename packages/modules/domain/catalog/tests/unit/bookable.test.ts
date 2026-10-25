/** ADR-IMPL-068: what a tap anywhere on the globe may open, from a home airport — the pure part. */
import { describe, expect, it } from "bun:test";
import type { BookablePlace } from "../../src/api";
import { bookableFrom } from "../../src/application/bookable";

const place = (code: string, city: string, countryCode: string, lat: number, lng: number): BookablePlace => ({
  code,
  name: city,
  city,
  countryCode,
  lat,
  lng,
});

const LHR = place("LHR", "London", "GB", 51.4707, -0.4599);
const FCO = place("FCO", "Rome", "IT", 41.8003, 12.2389);
const JFK = place("JFK", "New York", "US", 40.6413, -73.7781);
const EWR = place("EWR", "Newark", "US", 40.6925, -74.1687);
const LGA = place("LGA", "New York", "US", 40.7769, -73.874);
const ORD = place("ORD", "Chicago", "US", 41.9742, -87.9073);
const HND = place("HND", "Tokyo", "JP", 35.5494, 139.7798);

describe("bookableFrom — the cities a tap may open", () => {
  it("unions the site's set with the caller's, one entry per airport, by code", () => {
    const got = bookableFrom([LHR, FCO, ORD], { code: "ZZZ" }, [HND, { ...LHR, city: "Somewhere else" }]);
    expect(got.map((p) => p.code)).toEqual(["FCO", "HND", "LHR", "ORD"]);
    // The site's entry stands: the first seen wins.
    expect(got.find((p) => p.code === "LHR")?.city).toBe("London");
  });

  it("never home, nor an airport of its metro when home's place is known", () => {
    const site = [LHR, FCO, JFK, EWR, LGA, ORD];
    const fromNewYork = bookableFrom(site, { code: "jfk", lat: JFK.lat, lng: JFK.lng });
    expect(fromNewYork.map((p) => p.code)).toEqual(["FCO", "LHR", "ORD"]);
    // Home's place unknown to the catalog: only its own code goes.
    expect(bookableFrom(site, { code: "JFK" }).map((p) => p.code)).toEqual(["EWR", "FCO", "LGA", "LHR", "ORD"]);
  });

  it("leaves out what cannot be placed or named as an airport", () => {
    const got = bookableFrom(
      [
        { ...FCO, lat: Number.NaN },
        { ...HND, lng: 200 },
        { ...ORD, code: "ORDX" },
        { ...LHR, code: " lhr " },
      ],
      { code: "JFK" },
    );
    expect(got).toEqual([{ ...LHR, code: "LHR" }]);
  });
});
