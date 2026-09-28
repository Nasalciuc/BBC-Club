/** Ingest: the same Idempotency-Key twice at once (a CRM retry racing the first call) is one offer and one
 *  offer.published — the second call replays the first instead of failing on offers_idempotency. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createPlatform } from "@bbc/platform";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { ingest, type IngestDeps } from "../../src/application/ingest";

let iso: IsolatedDb;
let db: Executor;
let platform: ReturnType<typeof createPlatform>;
beforeAll(async () => {
  iso = await isolatedDb("proposals-ingest-idempotency", { max: 6 });
  db = iso.db as unknown as Executor;
  platform = createPlatform(iso.db, { level: "silent" });
  platform.events.defineEvent("offer.published", EVENT_CATALOGUE["offer.published"]);
});
afterAll(() => iso.drop());

const input = {
  source: "marketing_campaign" as const,
  targeting: "broadcast" as const,
  routeFrom: "JFK",
  routeTo: "LHR",
  cabin: "business" as const,
  price: "4200.00",
  title: "Your October in London",
  validUntil: "2027-12-31T23:59:59.000Z",
};
const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n);

describe("ingest — the same key twice at once", () => {
  it("one offer, one offer.published, and both calls answer with its id", async () => {
    const key = `race:${crypto.randomUUID()}`;
    // Whichever call publishes first holds its transaction open, so the other passes the replay check and reaches
    // its insert while the first row is still in flight.
    let publishes = 0;
    const deps: IngestDeps = {
      db,
      events: {
        publish: async (tx, e) => {
          if (++publishes === 1) await Bun.sleep(300);
          return platform.events.publish(tx, { ...e, publishedBy: "proposals" });
        },
      },
    };
    const [a, b] = await Promise.all([ingest(deps, input, key), ingest(deps, input, key)]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect(await count(sql`SELECT count(*)::int AS n FROM proposals.offers WHERE idempotency_key = ${key}`)).toBe(1);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM platform.domain_events WHERE type = 'offer.published'
                      AND payload->>'offerId' = ${a.ok ? a.offerId : ""}`),
    ).toBe(1);
  });

  it("a racing call with a different payload is a 409, not a second offer", async () => {
    const key = `race:${crypto.randomUUID()}`;
    let publishes = 0;
    const deps: IngestDeps = {
      db,
      events: {
        publish: async (tx, e) => {
          if (++publishes === 1) await Bun.sleep(300);
          return platform.events.publish(tx, { ...e, publishedBy: "proposals" });
        },
      },
    };
    const results = await Promise.all([ingest(deps, input, key), ingest(deps, { ...input, price: "3900.00" }, key)]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok && r.code === "CONFLICT").length).toBe(1);
    expect(await count(sql`SELECT count(*)::int AS n FROM proposals.offers WHERE idempotency_key = ${key}`)).toBe(1);
  });
});
