/** ADR-IMPL-083: the towns a tap is named by are kept by their score, not their distance, so a big town a little
 *  farther is never cut by the read's limit before `namingTown` weighs it. Made-up towns in the open South Atlantic,
 *  where the reference holds none. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { localitiesRepo } from "../../src/infrastructure/localities.repo";
import { namingTown } from "../../src/application/places-near";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-localities-near", { max: 2 });
});
afterAll(() => iso.drop());

describe("localitiesRepo.near", () => {
  it("keeps the town with the best score among more than forty in reach", async () => {
    const at = { lat: -40, lng: -20 };
    // Fifty small towns 3.3–4.4 km away (score: their distance), then a city of two million 6 km away (score 6 / 3.6,
    // about 1.7): the best score, but by distance alone the 51st.
    for (let i = 0; i < 50; i++) {
      await iso.db.execute(sql`
        INSERT INTO catalog.localities (id, name, country_code, lat, lng, population)
        VALUES (${990_000_000 + i}, ${`Small ${i}`}, 'ZZ', ${at.lat + 0.03 + i * 0.0002}::float8, ${at.lng}::float8, 5000)`);
    }
    await iso.db.execute(sql`
      INSERT INTO catalog.localities (id, name, country_code, lat, lng, population)
      VALUES (990000100, 'Big City', 'ZZ', ${at.lat - 0.054}::float8, ${at.lng}::float8, 2000000)`);

    const towns = await localitiesRepo.near(iso.db, at, 50);
    expect(towns.length).toBe(40);
    expect(towns[0]?.name).toBe("Big City");
    expect(namingTown(towns, 50)?.name).toBe("Big City");
  });
});
