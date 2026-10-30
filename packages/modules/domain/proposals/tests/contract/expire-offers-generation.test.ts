/** X11 (ADR-IMPL-075): an expiry that finds no active offer past its time runs no UPDATE, so proposals.offers'
 *  generation stays; one that expires an offer moves it once. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { expireOffers } from "../../src/application/expire-offers";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("proposals-expire-generation", { max: 2 });
});
afterAll(() => iso.drop());

const generation = async () =>
  Number(
    (
      (await iso.db.execute(sql`SELECT value FROM platform.generations WHERE key = 'proposals.offers'`)) as unknown as {
        value: string;
      }[]
    )[0]?.value ?? 0,
  );
const published: unknown[] = [];
const events = { publish: async (_tx: unknown, e: unknown) => void published.push(e) };

describe("expireOffers and the offers' generation", () => {
  it("nothing to expire: no write, the generation stays; an offer past its time: one move", async () => {
    await iso.db.execute(
      sql`UPDATE proposals.offers SET status = 'expired' WHERE status = 'active' AND valid_until < now()`,
    );
    const before = await generation();
    expect(await expireOffers({ db: iso.db, events })).toEqual({ expired: 0 });
    expect(await generation()).toBe(before);
    expect(published).toEqual([]);

    await iso.db.execute(sql`
      INSERT INTO proposals.offers (idempotency_key, source, targeting, route_from, route_to, cabin, price, title,
        publish_at, valid_until, status)
      VALUES (${`x11-${crypto.randomUUID()}`}, 'crm_agent', 'broadcast', 'JFK', 'LHR', 'business', '4200.00',
        'X11 probe', now() - interval '2 days', now() - interval '1 hour', 'active')`);
    const inserted = await generation();
    expect(await expireOffers({ db: iso.db, events })).toEqual({ expired: 1 });
    expect(await generation()).toBe(inserted + 1);
    expect(published).toHaveLength(1);
  });
});
