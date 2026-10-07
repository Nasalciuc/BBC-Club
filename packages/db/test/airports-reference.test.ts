import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { REFERENCE_TSV, parseReference } from "../scripts/airports-reference";

const rows = parseReference(readFileSync(REFERENCE_TSV, "utf8"));
const REGIONS = new Set(["africa", "americas", "asia", "europe", "middle_east", "oceania"]);

describe("parseReference", () => {
  const head = "code\tname\tcity\tcountry\tcountry_code\tregion\tlat\tlng\tpopularity\ttz\tsearch_terms";
  const row = "ZZZ\tTest Field\tTestville\tNowhere\tZZ\teurope\t1.000000\t2.000000\t5\tUTC\t";

  it("keeps an empty last field on the last line", () => {
    const [r] = parseReference(`${head}\n${row}\n`);
    expect(r?.code).toBe("ZZZ");
    expect(r?.searchTerms).toBeNull();
  });

  it("reads a Windows checkout the same way", () => {
    expect(parseReference(`${head}\r\n${row}\r\n`)).toEqual(parseReference(`${head}\n${row}\n`));
  });
});

describe("airports-reference.tsv", () => {
  it("lists thousands of airports, one per IATA code", () => {
    expect(rows.length).toBeGreaterThan(3500);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
    for (const r of rows) expect(r.code).toMatch(/^[A-Z]{3}$/);
  });

  it("gives every airport a real IANA time zone (flight times are shown in it)", () => {
    for (const r of rows) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: r.tz ?? "" })).not.toThrow();
    }
  });

  it("keeps regions, coordinates and country codes valid", () => {
    for (const r of rows) {
      expect(REGIONS.has(r.region)).toBe(true);
      expect(Math.abs(Number(r.lat))).toBeLessThanOrEqual(90);
      expect(Math.abs(Number(r.lng))).toBeLessThanOrEqual(180);
      expect(r.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(r.city.length).toBeGreaterThan(0);
    }
  });

  it("ranks the curated hubs as the curated seed does, and everything else below them", () => {
    const curated = new Map(
      readFileSync(new URL("../seeds/airports.csv", import.meta.url), "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => l.split(","))
        .map((f) => [f[0], Number(f[8])] as const),
    );
    for (const r of rows) {
      if (curated.has(r.code)) expect(r.popularity).toBe(curated.get(r.code));
      else expect(r.popularity ?? 0).toBeLessThan(40);
    }
  });

  it("puts an airport in its country's region, as the curated seed does (Istanbul and Izmir in Europe, Honolulu in the Americas)", () => {
    const curated = readFileSync(new URL("../seeds/airports.csv", import.meta.url), "utf8")
      .trim()
      .split("\n")
      .slice(1);
    for (const line of curated) {
      const [code, , , , , region] = line.split(",");
      const ref = rows.find((r) => r.code === code);
      if (ref) expect(`${code} ${ref.region}`).toBe(`${code} ${region}`);
    }
    expect(rows.find((r) => r.code === "ADB")?.region).toBe("europe");
    expect(rows.find((r) => r.code === "AAC")?.region).toBe("africa");
  });

  it("finds the cities members type, by the city they serve", () => {
    const by = (code: string) => rows.find((r) => r.code === code);
    expect(by("OTP")?.city).toBe("Bucharest");
    expect(by("NRT")?.city).toBe("Tokyo");
    expect(by("RMO")?.searchTerms).toContain("KIV");
    expect(by("EWR")?.searchTerms).toContain("New York City");
  });
});
