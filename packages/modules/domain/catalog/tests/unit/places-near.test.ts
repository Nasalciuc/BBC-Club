import { describe, expect, it } from "bun:test";

import { namingTown, nearestAirports, parsePoint, townScore } from "../../src/application/places-near";

const town = (name: string, population: number, km: number) => ({ name, countryCode: "US", population, km });

describe("namingTown (ADR-IMPL-083)", () => {
  it("names the tap for the nearest town, a bigger one counting as nearer", () => {
    // 6 km from Manhattan's centre, 3 km from Hoboken's: New York.
    expect(namingTown([town("Hoboken", 53_000, 3), town("New York City", 8_800_000, 6)], 50)?.name).toBe(
      "New York City",
    );
    // On Hoboken itself: Hoboken.
    expect(namingTown([town("Hoboken", 53_000, 0.5), town("New York City", 8_800_000, 5)], 50)?.name).toBe("Hoboken");
    // Two towns of a size: the nearer.
    expect(namingTown([town("B", 6_000, 4), town("A", 6_000, 2)], 50)?.name).toBe("A");
  });

  it("leaves out towns past the reach, and names nothing without one", () => {
    expect(namingTown([town("Far", 9_000_000, 51)], 50)).toBeNull();
    expect(namingTown([], 50)).toBeNull();
  });

  it("breaks a tie by size, then by name", () => {
    expect(namingTown([town("Zed", 5_000, 1), town("Ash", 5_000, 1)], 50)?.name).toBe("Ash");
    // Same score: 1 km at 5,000 people, 2 km where the size halves the distance.
    const big = 5_000 * 10;
    expect(townScore({ population: big, km: 2 })).toBe(1);
    expect(namingTown([town("Small", 5_000, 1), town("Big", big, 2)], 50)?.name).toBe("Big");
  });
});

describe("nearestAirports (ADR-IMPL-083)", () => {
  const rows = [
    { code: "RMO", lat: "46.927740", lng: "28.931704" },
    { code: "IAS", lat: "47.179633", lng: "27.621431" },
    { code: "SCV", lat: "47.687500", lng: "26.354099" },
    { code: "LHR", lat: "51.470600", lng: "-0.461941" },
  ];

  it("lists the airports within reach, nearest first, at most the limit", () => {
    const balti = { lat: 47.763, lng: 27.929 };
    expect(nearestAirports(rows, balti, 6, 600).map((a) => a.row.code)).toEqual(["IAS", "SCV", "RMO"]);
    expect(nearestAirports(rows, balti, 2, 600).map((a) => a.row.code)).toEqual(["IAS", "SCV"]);
    expect(nearestAirports(rows, balti, 6, 100).map((a) => a.row.code)).toEqual(["IAS"]);
    expect(nearestAirports(rows, { lat: -40, lng: -120 }, 6, 600)).toEqual([]);
  });
});

describe("parsePoint", () => {
  it("reads decimal degrees and brings a turned globe's longitude back into −180…180", () => {
    expect(parsePoint("47.76", "27.93")).toEqual({ lat: 47.76, lng: 27.93 });
    expect(parsePoint("-33.9", "-151.2")).toEqual({ lat: -33.9, lng: -151.2 });
    expect(parsePoint("10", "190")).toEqual({ lat: 10, lng: -170 });
    expect(parsePoint("10", "-190")).toEqual({ lat: 10, lng: 170 });
    expect(parsePoint("0", "180")?.lng).toBe(-180);
  });

  it("refuses what is not a point", () => {
    for (const [lat, lng] of [
      ["91", "0"],
      ["0", "541"],
      ["1e2", "3"],
      ["", "1"],
      [undefined, "1"],
      ["abc", "1"],
      ["1", "0x10"],
      ["1.123456789", "1"],
    ] as const) {
      expect(parsePoint(lat, lng)).toBeNull();
    }
  });
});
