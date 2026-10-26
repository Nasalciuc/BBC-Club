/** Whether an airport is in the phone's time zone (lib/zone-match.ts; ADR-IMPL-039, ADR-IMPL-072). */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ZONE_ALIASES, cityKey, currentZone, inZone, sameZone, zoneCityKey } from "./zone-match";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

/** The club's reference airports (packages/db/seeds/airports-reference.tsv): code → its city and zone. Read, never
 *  imported — the rows below are the catalogue's own, not made up. */
const catalogue = new Map(
  readFileSync(join(ROOT, "packages/db/seeds/airports-reference.tsv"), "utf8")
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const f = line.split("\t");
      return [f[0]!, { code: f[0]!, city: f[2]!, tz: f[9]! }] as const;
    }),
);
const airport = (code: string) => {
  const row = catalogue.get(code);
  if (!row) throw new Error(`${code} is not in the club's airports`);
  return row;
};
/** The same airport as an older server sends it: no zone. */
const withoutZone = (code: string) => ({ code, city: airport(code).city });

describe("currentZone / sameZone — one zone under the names a phone may report", () => {
  it("reads Android's ICU names as the catalogue's current ones", () => {
    expect(currentZone("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
    expect(currentZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(currentZone("America/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(sameZone("Asia/Saigon", "Asia/Ho_Chi_Minh")).toBe(true);
    expect(sameZone("Asia/Ho_Chi_Minh", "Asia/Ho_Chi_Minh")).toBe(true);
  });

  it("reads a country-level or retired name as its zone", () => {
    expect(currentZone("Japan")).toBe("Asia/Tokyo");
    expect(currentZone("Canada/Eastern")).toBe("America/Toronto");
    expect(currentZone("America/Yellowknife")).toBe("America/Edmonton");
  });

  it("never joins two places that merely share the clock", () => {
    expect(sameZone("Asia/Bangkok", "Asia/Ho_Chi_Minh")).toBe(false);
    expect(sameZone("America/Marigot", "America/Port_of_Spain")).toBe(false);
  });

  it("maps every old name to a current one this runtime can format", () => {
    for (const current of Object.values(ZONE_ALIASES)) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: current })).not.toThrow();
      expect(ZONE_ALIASES[current]).toBeUndefined();
    }
  });
});

describe("ZONE_ALIASES is the catalogue's table (packages/modules/domain/catalog, discovery.ts)", () => {
  it("holds the same names, mapped alike", () => {
    const source = readFileSync(join(ROOT, "packages/modules/domain/catalog/src/application/discovery.ts"), "utf8");
    const block = source.match(/export const ZONE_ALIASES[^{]*\{([\s\S]*?)\n\};/)?.[1];
    expect(block).toBeDefined();
    const server = Object.fromEntries(
      [...block!.matchAll(/^\s*"?([^":\s]+)"?:\s*"([^"]+)",?\s*$/gm)].map((m) => [m[1], m[2]]),
    );
    expect(Object.keys(server).length).toBeGreaterThan(0);
    expect(ZONE_ALIASES).toEqual(server);
  });
});

describe("cityKey / zoneCityKey — a city as a zone's name says it", () => {
  it("drops accents, punctuation, case and a trailing `city`", () => {
    expect(cityKey("Ho Chi Minh City")).toBe("ho chi minh");
    expect(cityKey("St. John's")).toBe("st johns");
    expect(cityKey("Zürich")).toBe("zurich");
    expect(cityKey("Port-au-Prince")).toBe("port au prince");
  });

  it("names a zone's city by its current name", () => {
    expect(zoneCityKey("Asia/Ho_Chi_Minh")).toBe("ho chi minh");
    expect(zoneCityKey("Asia/Saigon")).toBe("ho chi minh");
    expect(zoneCityKey("America/St_Johns")).toBe("st johns");
    expect(zoneCityKey("America/Mexico_City")).toBe("mexico");
    expect(zoneCityKey("Japan")).toBe("tokyo");
  });
});

describe("inZone — the club's airports in the zone a phone reports", () => {
  it("finds SGN for a phone in Vietnam, under either name of its zone", () => {
    expect(inZone(airport("SGN"), "Asia/Ho_Chi_Minh")).toBe(true);
    expect(inZone(airport("SGN"), "Asia/Saigon")).toBe(true);
  });

  it("finds the airports Android's names used to miss", () => {
    const cases: [string, string][] = [
      ["CCU", "Asia/Calcutta"],
      ["KTM", "Asia/Katmandu"],
      ["RGN", "Asia/Rangoon"],
      ["EZE", "America/Buenos_Aires"],
      ["GOH", "America/Godthab"],
      ["IND", "America/Indianapolis"],
      ["SDF", "America/Louisville"],
    ];
    for (const [code, zone] of cases) {
      expect(airport(code).tz).not.toBe(zone); // what the phone says is not what the catalogue says
      expect(inZone(airport(code), zone)).toBe(true);
    }
  });

  it("finds an airport sent without its zone by the zone's city", () => {
    expect(inZone(withoutZone("SGN"), "Asia/Saigon")).toBe(true);
    expect(inZone(withoutZone("SGN"), "Asia/Ho_Chi_Minh")).toBe(true);
    expect(inZone(withoutZone("GUA"), "America/Guatemala")).toBe(true);
    expect(inZone(withoutZone("KWI"), "Asia/Kuwait")).toBe(true);
    expect(inZone(withoutZone("PTY"), "America/Panama")).toBe(true);
    expect(inZone(withoutZone("YYT"), "America/St_Johns")).toBe(true);
    expect(inZone(withoutZone("NRT"), "Japan")).toBe(true);
  });

  it("lets an airport's own zone decide where it has one", () => {
    // Hanoi's row says Asia/Bangkok (the catalogue's zone, kept as it is): not the phone's Asia/Ho_Chi_Minh.
    expect(inZone(airport("HAN"), "Asia/Ho_Chi_Minh")).toBe(false);
    // Florida's Panama City Beach is in America/Chicago, whatever its name.
    expect(inZone(airport("ECP"), "America/Panama")).toBe(false);
    expect(inZone(withoutZone("ECP"), "America/Panama")).toBe(false);
    expect(inZone(airport("HKG"), "Asia/Saigon")).toBe(false);
  });
});
