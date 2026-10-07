/** The reference loader against a real database: insert-only, and search terms filled only where a row has none. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

import { loadAirportsReference } from "../scripts/airports-reference";
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
