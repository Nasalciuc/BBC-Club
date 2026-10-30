/** H3 (ADR-IMPL-074): the airports' typeahead sends the swapped spellings as one bound array, so a query of 4 letters
 *  and one of 64 are the same statement text — not one prepared statement per length typed. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDb } from "@bbc/db";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { airportsRepo } from "../../src/infrastructure/airports.repo";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-airport-search-text", { max: 1 });
});
afterAll(() => iso.drop());

describe("airport typeahead", () => {
  it("4, 20 and 64 letters: one statement text, and the answers stay as they were", async () => {
    const texts: string[] = [];
    const db = createDb(iso.url, { max: 1, logger: { logQuery: (q: string) => void texts.push(q) } });
    try {
      for (const q of ["lond", "londonderryxyzabcdef", "l".repeat(32) + "o".repeat(32)])
        await airportsRepo.search(db, q);
      expect(new Set(texts).size).toBe(1);
      expect((await airportsRepo.search(db, "Lodnon")).map((a) => a.code)).toContain("LHR");
      expect((await airportsRepo.search(db, "Pairs")).map((a) => a.code)).toContain("CDG");
    } finally {
      await db.close();
    }
  });
});
