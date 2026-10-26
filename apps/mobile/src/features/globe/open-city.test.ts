/**
 * ADR-IMPL-068, decision 4: a snapped city opens exactly as a pin's tap does — one airport, so one `state.to` and one
 * recent search, whichever way the city was chosen.
 */
import { describe, expect, it } from "bun:test";
import type { BookablePlaceVM, DestinationPinVM } from "@bbc/shared/api/v1/fares";
import type { GlobeTap } from "@bbc/ui";

import { parseRecent, withSearch } from "../explore/recent-search-logic";
import { INITIAL_SEARCH, searchReducer } from "../search/search-logic";
import { exploreTap } from "./globe-tap-logic";
import { cityToOpen } from "./open-city";

/** Rome's airport as Home's list of places a tap may snap to sends it (public airport data). */
const FCO_PLACE: BookablePlaceVM = {
  code: "FCO",
  city: "Rome",
  name: "Fiumicino",
  countryCode: "IT",
  lat: 41.8003,
  lng: 12.2389,
};
/**
 * The same airport as Home's pin, named and placed otherwise than the list does — the pins come from Home's rows, the
 * list from its own cache — and with everything a pin carries besides: price, offer, region, source, zone, line. All
 * made up, so the test sees which of the two a city opens with.
 */
const FCO_PIN: DestinationPinVM = {
  ...FCO_PLACE,
  name: "Rome Fiumicino",
  lat: 41.79,
  lng: 12.25,
  fromPrice: 1234,
  hasOffer: true,
  region: "Europe",
  priceSource: "site",
  tz: "Europe/Rome",
  description: "A made-up line.",
};
/** A city the list holds that no pin shows. */
const LIS_PLACE: BookablePlaceVM = {
  code: "LIS",
  city: "Lisbon",
  name: "Humberto Delgado",
  countryCode: "PT",
  lat: 38.7742,
  lng: -9.1342,
};

/** A finger 45 km from Rome at rest: the city under it. */
const NEAR_ROME: GlobeTap = { lat: 41.5, lng: 12.6, x: 200, y: 300, project: () => ({ x: 201, y: 301 }) };
const SIX = ["city", "code", "countryCode", "lat", "lng", "name"];
const sixOf = (a: BookablePlaceVM) => ({
  code: a.code,
  city: a.city,
  name: a.name,
  countryCode: a.countryCode,
  lat: a.lat,
  lng: a.lng,
});

describe("a snapped city opens as a pin's tap does", () => {
  it("the same airport, the same state.to, the same recent search", () => {
    const what = exploreTap("rest", NEAR_ROME, [FCO_PLACE, LIS_PLACE], null);
    if (what?.kind !== "open") throw new Error("a tap 45 km from Rome opens Rome");
    expect(what.place).toBe(FCO_PLACE);

    // The two ways Explore opens a city (explore.tsx `openCity`): a pin's tap, and the snap.
    const byPin = cityToOpen("FCO", [FCO_PIN]);
    const bySnap = cityToOpen(what.place.code, [FCO_PIN], what.place);
    // The pin's airport, both ways — not the list's entry the tap snapped to.
    expect(byPin).toStrictEqual(sixOf(FCO_PIN));
    expect(bySnap).toStrictEqual(sixOf(FCO_PIN));
    expect(bySnap).not.toStrictEqual(sixOf(FCO_PLACE));
    expect(Object.keys(byPin!).sort()).toEqual(SIX); // the pin's price, offer, source, zone and line stay on the pin

    const to = (airport: typeof byPin) =>
      searchReducer(INITIAL_SEARCH, { type: "selectDestination", airport: airport! }).to;
    expect(to(bySnap)).toStrictEqual(to(byPin));

    const recent = (airport: typeof byPin) => withSearch([], airport!, null);
    expect(recent(bySnap)).toStrictEqual(recent(byPin));
    // As the phone keeps it, and as Search reads it back.
    expect(JSON.stringify(recent(bySnap))).toBe(JSON.stringify(recent(byPin)));
    expect(parseRecent(JSON.stringify(recent(bySnap)))).toStrictEqual(parseRecent(JSON.stringify(recent(byPin))));
  });

  it("a city with no pin opens with the list's entry, in the same shape", () => {
    expect(cityToOpen("LIS", [FCO_PIN], LIS_PLACE)).toStrictEqual(LIS_PLACE);
    expect(Object.keys(cityToOpen("LIS", [FCO_PIN], LIS_PLACE)!).sort()).toEqual(SIX);
  });

  it("a code with neither a pin nor its snapped place opens nothing", () => {
    expect(cityToOpen("LIS", [FCO_PIN])).toBeNull();
    expect(cityToOpen("LIS", [FCO_PIN], FCO_PLACE)).toBeNull();
  });
});
