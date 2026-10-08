import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { FIXES_TSV, REFERENCE_TSV, parseFixes, parseReference } from "../scripts/airports-reference";

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

/** Letters without their marks, lower case — what "differs only in accents" means. Postgres's unaccent agrees. */
const plain = (s: string) =>
  s
    .replace(/[łŁ]/g, "l")
    .replace(/[øØ]/g, "o")
    .replace(/[đĐðÐ]/g, "d")
    .replace(/ı/g, "i")
    .replace(/[þÞ]/g, "th")
    .replace(/[æÆ]/g, "ae")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

describe("airports-reference-fixes.tsv — the corrected cities (ADR-IMPL-038)", () => {
  const fixes = parseFixes(readFileSync(FIXES_TSV, "utf8"));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const curated = new Map(
    readFileSync(new URL("../seeds/airports.csv", import.meta.url), "utf8")
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.split(","))
      .map((f) => [f[0]!, f[2]!] as const),
  );

  it("names each airport once, and says what the reference holds now", () => {
    expect(fixes.length).toBeGreaterThan(700);
    expect(new Set(fixes.map((f) => f.code)).size).toBe(fixes.length);
    for (const f of fixes) {
      expect(`${f.code} ${byCode.get(f.code)?.city}`).toBe(`${f.code} ${f.to}`);
      expect(f.from).not.toBe(f.to);
    }
  });

  it("changes only marks and letter case where it says accents", () => {
    for (const f of fixes.filter((x) => x.reason === "accents")) expect(plain(f.to)).toBe(plain(f.from));
  });

  it("keeps old and local names searchable — at the end of the reference's search terms", () => {
    for (const f of fixes.filter((x) => x.searchable.length)) {
      expect(byCode.get(f.code)?.searchTerms?.endsWith(f.searchable.join(" | "))).toBe(true);
    }
  });

  it("agrees with the curated seed on every curated airport's city", () => {
    for (const [code, city] of curated) expect(`${code} ${byCode.get(code)?.city}`).toBe(`${code} ${city}`);
  });

  it("writes cities cleanly: composed Unicode, no slash, no double space, Romanian comma-below letters", () => {
    for (const r of rows) {
      expect(r.city).toBe(r.city.normalize("NFC"));
      expect(r.city).not.toContain("/");
      expect(r.city).not.toContain("  ");
      if (r.countryCode === "RO" || r.countryCode === "MD") expect(r.city).not.toMatch(/[şţŞŢ]/);
    }
  });

  it("shows the city members fly to", () => {
    const city = (code: string) => byCode.get(code)?.city;
    expect(city("CVG")).toBe("Cincinnati");
    expect(city("EZE")).toBe("Buenos Aires");
    expect(city("IAD")).toBe("Washington");
    expect(city("NGO")).toBe("Nagoya");
    expect(city("XIY")).toBe("Xi'an");
    expect(city("IST")).toBe("Istanbul");
    expect(city("DPS")).toBe("Bali");
    expect(city("BOB")).toBe("Bora Bora");
    expect(city("BEG")).toBe("Belgrade");
    expect(city("RMO")).toBe("Chișinău");
    expect(city("CIA")).toBe("Rome");
    expect(byCode.get("EZE")?.searchTerms).toContain("Ezeiza");
  });
});
