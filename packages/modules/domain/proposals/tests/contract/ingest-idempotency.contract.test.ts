/** Ingest: the same Idempotency-Key twice at once (a CRM retry racing the first call) is one offer and one
 *  offer.published — the second call replays the first instead of failing on offers_idempotency. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createPlatform } from "@bbc/platform";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { ingest, IngestInput, type IngestDeps } from "../../src/application/ingest";

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
      rating: 4.8,
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
      { rating: 4.9 },
      { rating: undefined },
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

  it("an omitted publishAt matches a default-now row, not a schedule the first call sent", async () => {
    const deps: IngestDeps = {
      db,
      events: { publish: (tx, e) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }) },
    };
    const scheduled = "2027-06-01T12:00:00.000Z";

    const omittedKey = `pub:${crypto.randomUUID()}`;
    const omitted = await ingest(deps, input, omittedKey);
    expect(omitted.ok).toBe(true);
    expect(await ingest(deps, input, omittedKey)).toEqual(omitted);

    const scheduledKey = `pub:${crypto.randomUUID()}`;
    const first = await ingest(deps, { ...input, publishAt: scheduled }, scheduledKey);
    expect(first.ok).toBe(true);
    expect(await ingest(deps, { ...input, publishAt: scheduled }, scheduledKey)).toEqual(first);
    expect(await ingest(deps, input, scheduledKey)).toEqual({ ok: false, code: "CONFLICT" });

    const nowKey = `pub:${crypto.randomUUID()}`;
    const created = await ingest(deps, input, nowKey);
    expect(created.ok).toBe(true);
    expect(await ingest(deps, { ...input, publishAt: scheduled }, nowKey)).toEqual({ ok: false, code: "CONFLICT" });
  });
});

// ADR-IMPL-056: the rating an offer's cards print (02, 16: `★ 4.8`), as the sender gives it.
describe("ingest — an offer's rating", () => {
  const deps = (): IngestDeps => ({
    db,
    events: { publish: (tx, e) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }) },
  });
  const stored = async (offerId: string) =>
    (
      (await db.execute(sql`SELECT rating FROM proposals.offers WHERE id = ${offerId}`)) as unknown as {
        rating: string | null;
      }[]
    )[0]?.rating;

  it("is stored as sent, to one decimal place, and none without one", async () => {
    for (const [rating, row] of [
      [4.8, "4.8"],
      [5, "5.0"],
      [1, "1.0"],
      [undefined, null],
    ] as const) {
      const r = await ingest(
        deps(),
        { ...input, ...(rating === undefined ? {} : { rating }) },
        `rate:${rating}:${crypto.randomUUID()}`,
      );
      expect(r.ok).toBe(true);
      expect(await stored(r.ok ? r.offerId : "")).toBe(row);
    }
  });

  it("one to five, one decimal place at most: anything else is refused before it is stored", () => {
    for (const rating of [4.8, 1, 5, 3.0, 2.5]) expect(IngestInput.safeParse({ ...input, rating }).success).toBe(true);
    for (const rating of [0.9, 5.1, 0, -1, 4.85, Number.NaN, "4.8", null])
      expect({ rating, ok: IngestInput.safeParse({ ...input, rating }).success }).toEqual({ rating, ok: false });
  });

  it("the database refuses a rating outside one to five written past the ingest", async () => {
    const r = await ingest(deps(), input, `rate:raw:${crypto.randomUUID()}`);
    const id = r.ok ? r.offerId : "";
    for (const [rating, expected] of [
      ["5.1", "23514"],
      ["0.9", "23514"],
      ["4.8", "ok"],
    ] as const) {
      const outcome = await db
        .execute(sql`UPDATE proposals.offers SET rating = ${rating}::numeric WHERE id = ${id}`)
        .then(() => "ok")
        .catch((err: { code?: string; cause?: { code?: string } }) => err.code ?? err.cause?.code);
      expect({ rating, outcome }).toEqual({ rating, outcome: expected });
    }
  });
});
