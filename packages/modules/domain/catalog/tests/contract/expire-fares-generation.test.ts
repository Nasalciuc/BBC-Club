/** X11 (ADR-IMPL-075): an expiry that finds nothing past its time runs no UPDATE, so catalog.fares' generation — and
 *  every cache built on it — stays; one that expires a fare moves it once. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { expireFares } from "../../src/application/expire-fares";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("catalog-expire-generation", { max: 2 });
});
afterAll(() => iso.drop());

const generation = async () =>
  Number(
    (
      (await iso.db.execute(sql`SELECT value FROM platform.generations WHERE key = 'catalog.fares'`)) as unknown as {
        value: string;
      }[]
    )[0]?.value ?? 0,
  );

describe("expireFares and the fares' generation", () => {
  it("nothing to expire: no write, the generation stays; a fare past its time: one move", async () => {
    await iso.db.execute(sql`UPDATE catalog.fares SET published = false WHERE published AND valid_until < now()`);
    const before = await generation();
    expect(await expireFares({ db: iso.db })).toEqual({ expired: 0 });
    expect(await generation()).toBe(before);

    await iso.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from,
        valid_until, published)
      VALUES ('JFK', 'LHR', 'business', 'BA', true, '4200.00', 'USD', 'manual', now() - interval '2 days',
        now() - interval '1 hour', true)`);
    const inserted = await generation();
    expect(await expireFares({ db: iso.db })).toEqual({ expired: 1 });
    expect(await generation()).toBe(inserted + 1);
  });
});
