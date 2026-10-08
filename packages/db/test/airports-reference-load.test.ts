/** The reference loader against a real database: insert-only, and search terms filled only where a row has none; the
 *  corrected cities reach rows that are still exactly the reference's (ADR-IMPL-038). */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

import {
  FIXES_TSV,
  REFERENCE_TSV,
  applyReferenceFixes,
  loadAirportsReference,
  parseFixes,
  parseReference,
  type ReferenceFix,
} from "../scripts/airports-reference";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;

beforeAll(async () => {
  iso = await isolatedDb("airports-reference-load");
});

afterAll(async () => {
  await iso.drop();
});

const row = async (code: string) =>
  (
    (await iso.db.execute(
      sql`SELECT city, popularity, search_terms FROM catalog.airports WHERE code = ${code}`,
    )) as unknown as { city: string; popularity: number; search_terms: string | null }[]
  )[0];

describe("loadAirportsReference", () => {
  it("adds nothing twice", async () => {
    expect(await loadAirportsReference(iso.db)).toBe(0); // the template already ran it once
  });

  it("fills search terms on an airport that has none — and touches nothing else on it", async () => {
    // As the catalogue import or the curated seed leave it: their own city and popularity, no search terms.
    await iso.db.execute(
      sql`UPDATE catalog.airports SET city = 'Narita', popularity = 77, search_terms = NULL WHERE code = 'NRT'`,
    );
    await loadAirportsReference(iso.db);
    const nrt = await row("NRT");
    expect(nrt?.search_terms).toContain("Tokyo");
    expect(nrt?.city).toBe("Narita");
    expect(nrt?.popularity).toBe(77);
  });

  it("never overwrites search terms a row already has", async () => {
    await iso.db.execute(sql`UPDATE catalog.airports SET search_terms = 'kept' WHERE code = 'LHR'`);
    await loadAirportsReference(iso.db);
    expect((await row("LHR"))?.search_terms).toBe("kept");
  });

  it("restores a deleted airport, since it is missing", async () => {
    await iso.db.execute(sql`DELETE FROM catalog.airports WHERE code = 'RMO'`);
    expect(await loadAirportsReference(iso.db)).toBe(1);
    expect((await row("RMO"))?.search_terms).toContain("KIV");
  });
});

describe("applyReferenceFixes — corrected cities reach existing rows (ADR-IMPL-038)", () => {
  const fixes = parseFixes(readFileSync(FIXES_TSV, "utf8"));
  const reference = new Map(parseReference(readFileSync(REFERENCE_TSV, "utf8")).map((r) => [r.code, r]));
  /** The reference's search terms before a fix appended the names it keeps searchable. */
  const termsBefore = (f: ReferenceFix) => {
    const terms = reference.get(f.code)?.searchTerms ?? "";
    if (!f.searchable.length) return terms || null;
    const kept = f.searchable.join(" | ");
    return terms.slice(0, terms.length - kept.length).replace(/ \| $/, "") || null;
  };

  it("does nothing on a database loaded from the corrected reference", async () => {
    expect(await applyReferenceFixes(iso.db)).toBe(0);
  });

  it("brings every row of the earlier reference to the corrected one — city and search terms — once", async () => {
    const earlier = sql.join(
      fixes.map((f) => sql`(${f.code}::text, ${f.from}::text, ${termsBefore(f)}::text)`),
      sql`, `,
    );
    await iso.db.execute(sql`
      UPDATE catalog.airports AS a SET city = v.city, search_terms = v.terms
      FROM (VALUES ${earlier}) AS v(code, city, terms) WHERE a.code = v.code`);

    expect(await applyReferenceFixes(iso.db)).toBe(fixes.length);
    const now = (await iso.db.execute(
      sql`SELECT code, city, search_terms FROM catalog.airports WHERE code IN ${fixes.map((f) => f.code)}`,
    )) as unknown as { code: string; city: string; search_terms: string | null }[];
    expect(now.length).toBe(fixes.length);
    for (const r of now) {
      const want = reference.get(r.code);
      expect(`${r.code} ${r.city} | ${r.search_terms}`).toBe(`${r.code} ${want?.city} | ${want?.searchTerms ?? null}`);
    }
    expect(await applyReferenceFixes(iso.db)).toBe(0);
  });

  it("keeps a curated city, yet gives the row the reference's newer search terms", async () => {
    const del = fixes.find((f) => f.code === "DEL")!;
    await iso.db.execute(
      sql`UPDATE catalog.airports SET name = 'Indira Gandhi International', city = 'Delhi', search_terms = ${termsBefore(del)}
          WHERE code = 'DEL'`,
    );
    expect(await applyReferenceFixes(iso.db)).toBe(1);
    expect(await row("DEL")).toMatchObject({ city: "Delhi", search_terms: reference.get("DEL")?.searchTerms });
    expect((await row("DEL"))?.search_terms).toContain("New Delhi");
  });

  it("never touches a row the curated seed or the catalogue import wrote — they carry their own name", async () => {
    await iso.db.execute(
      sql`UPDATE catalog.airports SET city = 'Hebron', name = 'Cincinnati/Northern Kentucky International' WHERE code = 'CVG'`,
    );
    expect(await applyReferenceFixes(iso.db)).toBe(0);
    expect((await row("CVG"))?.city).toBe("Hebron");
  });

  it("corrects the city but keeps search terms someone changed", async () => {
    await iso.db.execute(sql`UPDATE catalog.airports SET city = 'Ezeiza', search_terms = 'kept' WHERE code = 'EZE'`);
    expect(await applyReferenceFixes(iso.db)).toBe(1);
    expect(await row("EZE")).toMatchObject({ city: "Buenos Aires", search_terms: "kept" });
  });
});
