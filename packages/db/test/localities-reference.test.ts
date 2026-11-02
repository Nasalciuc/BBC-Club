import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { LOCALITIES_TSV, parseLocalities } from "../scripts/localities-reference";

const rows = parseLocalities(readFileSync(LOCALITIES_TSV, "utf8"));

describe("parseLocalities", () => {
  const head = "id\tname\tcountry_code\tlat\tlng\tpopulation";

  it("reads a Windows checkout the same way", () => {
    const row = "1\tTestville\tZZ\t1.00000\t2.00000\t5000";
    expect(parseLocalities(`${head}\r\n${row}\r\n`)).toEqual(parseLocalities(`${head}\n${row}\n`));
  });

  it("refuses another header or a short line", () => {
    expect(() => parseLocalities("id\tname\n")).toThrow("unexpected header");
    expect(() => parseLocalities(`${head}\n1\tTestville\tZZ\n`)).toThrow("line 2 has 3 fields");
  });
});

describe("localities-reference.tsv (ADR-IMPL-083)", () => {
  it("lists tens of thousands of towns of 5,000 people or more, one per GeoNames id", () => {
    expect(rows.length).toBeGreaterThan(40_000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(Number.isInteger(r.id) && r.id > 0).toBe(true);
      expect(r.population).toBeGreaterThanOrEqual(5_000);
    }
  });

  it("keeps names, country codes and coordinates the table's checks accept", () => {
    for (const r of rows) {
      expect(r.name.trim()).toBe(r.name);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.name.length).toBeLessThanOrEqual(200);
      expect(r.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lng)).toBeLessThanOrEqual(180);
    }
  });

  it("holds the towns the tests and the ADR name", () => {
    const names = new Set(rows.filter((r) => r.countryCode === "MD").map((r) => r.name));
    for (const n of ["Bălţi", "Chisinau", "Orhei", "Cahul"]) expect(names.has(n)).toBe(true);
  });
});
