import { describe, expect, it } from "bun:test";
import { destinationCities, requestRoute, routeEnds } from "../../src/application/route";

const leg = (from: string, to: string) => ({ from, to, date: "2027-10-12" });

describe("requestRoute", () => {
  it("names the outbound leg of a round trip, never the way home", () => {
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "JFK")], "round")).toBe("JFK → LHR");
  });

  it("names a one-way trip by its only leg", () => {
    expect(requestRoute([leg("JFK", "LHR")], "oneway")).toBe("JFK → LHR");
  });

  it("names a multi-city trip by its last stop, even when it ends at home", () => {
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "CDG")], "multi")).toBe("JFK → CDG");
    expect(requestRoute([leg("JFK", "LHR"), leg("LHR", "CDG"), leg("CDG", "JFK")], "multi")).toBe("JFK → CDG");
  });

  it("says nothing when the legs say nothing", () => {
    expect(requestRoute([], "round")).toBe("");
    expect(requestRoute(null, "round")).toBe("");
    expect(requestRoute([{ from: 1, to: 2 }], "oneway")).toBe("");
    expect(routeEnds([leg("JFK", "LHR"), leg("LHR", "JFK")], undefined)).toEqual({ from: "JFK", to: "LHR" });
  });
});

describe("destinationCities", () => {
  const rows = [
    { legs: [leg("JFK", "LHR"), leg("LHR", "JFK")], tripType: "round" },
    { legs: [leg("JFK", "LHR")], tripType: "oneway" },
    { legs: [leg("JFK", "CDG")], tripType: "oneway" },
  ];

  it("reads each destination once, in one batch", async () => {
    const asked: string[][] = [];
    const cities = await destinationCities(
      rows,
      async (codes) => {
        asked.push(codes);
        return [
          { code: "LHR", city: "London" },
          { code: "CDG", city: "Paris" },
        ];
      },
      () => {},
    );
    expect(asked).toEqual([["LHR", "CDG"]]);
    expect([...cities]).toEqual([
      ["LHR", "London"],
      ["CDG", "Paris"],
    ]);
  });

  it("a failed read answers no cities and is reported — never thrown", async () => {
    const errors: unknown[] = [];
    const cities = await destinationCities(
      rows,
      async () => {
        throw new Error("catalog down");
      },
      (err) => errors.push(err),
    );
    expect(cities.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it("asks nothing for nothing, and an empty city is no city", async () => {
    let calls = 0;
    const none = await destinationCities(
      [],
      async () => {
        calls++;
        return [];
      },
      () => {},
    );
    expect([none.size, calls]).toEqual([0, 0]);
    const blank = await destinationCities(
      rows.slice(2),
      async () => [{ code: "CDG", city: " " }],
      () => {},
    );
    expect(blank.size).toBe(0);
  });
});
