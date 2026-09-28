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

  it("a retry is compared field by field: any stored difference is a 409, formatting is not", async () => {
    const key = `retry:${crypto.randomUUID()}`;
    const full = {
      ...input,
      publishedPrice: "7850.00",
      body: "Five nights, the suite on the river.",
      flightFacts: { nonstop: true, durationMinutes: 425, product: "Suite" },
      mediaUrl: "https://cdn.example.com/london.webp",
      createdBy: "campaign-autumn",
    };
    const deps: IngestDeps = {
      db,
      events: { publish: (tx, e) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }) },
    };
    const first = await ingest(deps, full, key);
    expect(first.ok).toBe(true);
    // Same payload, differently formatted: same number, same instant, keys in another order, default currency.
    const again = await ingest(
      deps,
      {
        ...full,
        price: "4200",
        validUntil: "2027-12-31T23:59:59Z",
        flightFacts: { product: "Suite", durationMinutes: 425, nonstop: true },
        currency: "USD",
      },
      key,
    );
    expect(again).toEqual(first);
    // Each stored field the first call did not send the same way is a conflict.
    for (const change of [
      { validUntil: "2027-11-30T23:59:59.000Z" },
      { publishedPrice: "7900.00" },
      { body: "Four nights." },
      { flightFacts: { nonstop: false, durationMinutes: 425, product: "Suite" } },
      { mediaUrl: "https://cdn.example.com/other.webp" },
      { createdBy: "campaign-winter" },
      { currency: "EUR" },
    ]) {
      expect({ change, result: await ingest(deps, { ...full, ...change }, key) }).toEqual({
        change,
        result: { ok: false, code: "CONFLICT" },
      });
    }
    expect(await count(sql`SELECT count(*)::int AS n FROM proposals.offers WHERE idempotency_key = ${key}`)).toBe(1);
  });
});
