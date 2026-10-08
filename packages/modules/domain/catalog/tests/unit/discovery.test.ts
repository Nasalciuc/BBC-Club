import { describe, expect, it } from "bun:test";

import { POPULAR, ZONE_ALIASES, homeZones, pickPopular } from "../../src/application/discovery";
import type { AirportRow } from "../../src/application/to-fare-vm";

const apt = (code: string, lat: number, lng: number) =>
  ({ code, city: code, name: code, lat: lat.toFixed(6), lng: lng.toFixed(6) }) as unknown as AirportRow;
const JFK = apt("JFK", 40.6413, -73.7781);
const EWR = apt("EWR", 40.6925, -74.1687); // 33 km from JFK
const LHR = apt("LHR", 51.47, -0.4543);
const CDG = apt("CDG", 49.0097, 2.5479);
const HND = apt("HND", 35.5494, 139.7798);
const LAX = apt("LAX", 33.9416, -118.4085);
const MIA = apt("MIA", 25.7959, -80.287);
const ZRH = apt("ZRH", 47.4647, 8.5492);
const hubs = [JFK, LHR, LAX, CDG, HND];
const codes = (r: { destinations: AirportRow[] }) => r.destinations.map((a) => a.code);

describe("pickPopular — 'Popular from <city>' (ADR-IMPL-039)", () => {
  it("shows the searched routes first, then fills with the hubs, at most four", () => {
    const r = pickPopular(JFK, [MIA, ZRH], hubs);
    expect(codes(r)).toEqual(["MIA", "ZRH", "LHR", "LAX"]);
    expect(r.fromSearches).toBe(2);
    expect(r.destinations.length).toBe(POPULAR.max);
  });

  it("never the origin, never an airport of the same metro, never twice", () => {
    const r = pickPopular(JFK, [EWR, LHR, LHR], hubs);
    expect(codes(r)).toEqual(["LHR", "LAX", "CDG", "HND"]);
    expect(r.fromSearches).toBe(1);
  });

  it("falls back to the hubs alone when nothing was searched enough", () => {
    expect(codes(pickPopular(LHR, [], hubs))).toEqual(["JFK", "LAX", "CDG", "HND"]);
  });

  it("keeps the approved limits", () => {
    expect(POPULAR).toEqual({ days: 7, minSearches: 5, max: 4 });
  });
});

describe("homeZones — the phone's time zone, as the airport data names it", () => {
  it("looks up the zone itself and, for an old name, the current one", () => {
    expect(homeZones("Europe/Chisinau")).toEqual(["Europe/Chisinau"]);
    expect(homeZones("Asia/Calcutta")).toEqual(["Asia/Calcutta", "Asia/Kolkata"]);
    expect(homeZones("US/Eastern")).toEqual(["US/Eastern", "America/New_York"]);
    expect(homeZones("America/Cordoba")).toEqual(["America/Cordoba", "America/Argentina/Cordoba"]); // Android (ICU)
    expect(homeZones("america/new_york")).toEqual(["America/New_York"]);
  });

  it("suggests nothing for UTC or an offset — not places", () => {
    for (const tz of ["UTC", "Etc/UTC", "Etc/GMT+3", "GMT", "+03:00"]) expect(homeZones(tz)).toEqual([]);
  });

  it("refuses what is not a time zone", () => {
    for (const tz of ["", "not/a_zone", "x".repeat(65)]) expect(homeZones(tz)).toBeNull();
  });

  it("maps every old name to a zone this runtime knows", () => {
    for (const [old, current] of Object.entries(ZONE_ALIASES)) {
      expect(homeZones(old)).toEqual([old, current]);
      expect(homeZones(current)).toEqual([current]);
    }
  });
});
