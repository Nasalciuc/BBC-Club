/** ADR-IMPL-075: the airports held in each process — read from memory, the same answers as the table, current within a
 *  second of any write (the table's trigger bumps `catalog.airports`). */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import { createAirportsReference } from "../../src/application/airports-reference";
import { airportsRepo } from "../../src/infrastructure/airports.repo";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-airports-reference", { max: 2 });
});
afterAll(() => iso.drop());

/** The reference over a db whose statements are counted (each read is one `select`). */
function counted() {
  let selects = 0;
  const db = new Proxy(iso.db, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (k === "select")
        return (...a: unknown[]) => {
          selects += 1;
          return (v as (...x: unknown[]) => unknown).apply(t, a);
        };
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  const platform = createPlatform(db, { level: "silent" });
  return { platform, ref: createAirportsReference(platform.reference, db), selects: () => selects };
}

describe("createAirportsReference", () => {
  it("answers as the table does: by code (any case), many in the order asked, the hubs, a zone's busiest", async () => {
    const { ref } = counted();
    expect((await ref.get("lhr"))?.code).toBe("LHR");
    expect(await ref.get("QQQ")).toBeNull();
    expect((await ref.getMany(["cdg", "LHR", "QQQ", "CDG"])).map((a) => a.code)).toEqual(["CDG", "LHR"]);
    const hubs = await ref.hubs(12);
    const table = await airportsRepo.getMany(
      iso.db,
      hubs.map((a) => a.code),
    );
    expect(hubs.length).toBe(12);
    expect(new Set(table.map((a) => a.code))).toEqual(new Set(hubs.map((a) => a.code)));
    const pops = hubs.map((a) => a.popularity);
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
    const ny = await ref.busiestIn(["America/New_York"]);
    expect(ny.length).toBeGreaterThan(0);
    expect(new Set(ny.map((a) => a.popularity)).size).toBe(1);
    expect(ny.map((a) => a.code)).toEqual([...ny.map((a) => a.code)].sort());
    expect(await ref.busiestIn(["Nowhere/Zone"])).toEqual([]);
  });

  it("one read of the table for a thousand lookups; the typeahead runs once per text", async () => {
    const { ref, selects } = counted();
    await ref.get("JFK");
    const afterLoad = selects();
    for (let i = 0; i < 1000; i++) await ref.get(i % 2 ? "JFK" : "LHR");
    await ref.getMany(["JFK", "LHR", "CDG"]);
    await ref.hubs(12);
    expect(selects()).toBe(afterLoad);
    const london = await ref.search("London");
    expect(london.map((a) => a.code)).toEqual((await airportsRepo.search(iso.db, "London")).map((a) => a.code));
    const once = selects();
    expect(await ref.search("  LONDON ")).toEqual(london);
    expect(selects()).toBe(once);
    expect(await ref.search("   ")).toEqual([]);
  });

  it("a write from psql is seen once the counters are read again — within a second on every process", async () => {
    const { platform, ref } = counted();
    const before = (await ref.get("GRU"))!;
    await iso.db.execute(sql`UPDATE catalog.airports SET city = 'Sao Paulo (test)' WHERE code = 'GRU'`);
    expect((await ref.get("GRU"))?.city).toBe(before.city); // the same second: what the process holds
    platform.reference.generations.invalidate();
    expect((await ref.get("GRU"))?.city).toBe("Sao Paulo (test)");
    await iso.db.execute(sql`UPDATE catalog.airports SET city = ${before.city} WHERE code = 'GRU'`);
  });
});
