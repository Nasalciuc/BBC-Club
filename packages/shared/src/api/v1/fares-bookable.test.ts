/** ADR-IMPL-068: Home's `bookable` is optional both ways, and a list the app cannot read never fails Home. */
import { describe, expect, it } from "bun:test";
import { HomeVM } from "./fares";

const home = {
  home: null,
  destinations: [],
  sections: [],
};
const rome = { code: "FCO", city: "Rome", name: "Fiumicino", countryCode: "IT", lat: 41.8003, lng: 12.2389 };

describe("HomeVM.bookable", () => {
  it("absent is absent: an older server, or the flag off", () => {
    expect(HomeVM.parse(home).bookable).toBeUndefined();
  });

  it("a list is read as sent, without the fields the app does not need", () => {
    const parsed = HomeVM.parse({ ...home, bookable: [{ ...rome, tz: "Europe/Rome", fromPrice: 1 }] });
    expect(parsed.bookable).toEqual([rome]);
  });

  it("a list this app cannot read is none — Home still parses, and a tap off the pins does nothing", () => {
    const parsed = HomeVM.parse({ ...home, bookable: [rome, { ...rome, code: "ROMA", lat: "north" }] });
    expect(parsed.bookable).toBeUndefined();
    expect(parsed.destinations).toEqual([]);
    expect(HomeVM.parse({ ...home, bookable: "everywhere" }).bookable).toBeUndefined();
  });
});
