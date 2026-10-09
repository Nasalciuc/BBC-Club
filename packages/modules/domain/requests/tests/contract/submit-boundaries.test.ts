/** submit(): one transaction for the row, its first event and the journal entry — and one request per
 *  Idempotency-Key even when the same key arrives twice at once (a double tap, a retry racing the first). */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createPlatform } from "@bbc/platform";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { submit, type SubmitActor } from "../../src/application/submit";

let iso: IsolatedDb;
let db: Executor;
let platform: ReturnType<typeof createPlatform>;
beforeAll(async () => {
  iso = await isolatedDb("requests-submit-boundaries", { max: 6 });
  db = iso.db as unknown as Executor;
  platform = createPlatform(iso.db, { level: "silent" });
  platform.events.defineEvent("request.submitted", EVENT_CATALOGUE["request.submitted"]);
});
afterAll(() => iso.drop());

const actor: SubmitActor = { memberId: "mem-boundaries", source: "ios", appVersion: null, ip: null };
const body = {
  tripType: "oneway",
  cabin: "business",
  legs: [{ from: "JFK", to: "LHR", date: "2027-10-12" }],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
};
const allowAll = { check: async () => ({ allowed: true }) };
const noEstimate = async () => null;
type PublishInput = Parameters<Parameters<typeof submit>[4]["publish"]>[1];
const publish = async (tx: Executor, e: PublishInput): Promise<void> => {
  await platform.events.publish(tx, { ...e, publishedBy: "requests" });
};

const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n);

describe("submit — transaction boundaries", () => {
  it("a failure after the writes leaves nothing: no request, no status event, no journal entry", async () => {
    const key = `idem-${crypto.randomUUID()}`;
    const injected = new Error("injected after the journal write");
    const failing = async (tx: Executor, e: PublishInput) => {
      await publish(tx, e);
      throw injected;
    };
    await expect(
      submit(db, body, actor, key, { publish: failing, rateLimit: allowAll, indicative: noEstimate }),
    ).rejects.toBe(injected);
    expect(await count(sql`SELECT count(*)::int AS n FROM requests.requests WHERE idempotency_key = ${key}`)).toBe(0);
    expect(await count(sql`SELECT count(*)::int AS n FROM requests.request_events`)).toBe(0);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM platform.domain_events WHERE type = 'request.submitted'`),
    ).toBe(0);

    // The same key then goes through: nothing half-written stands in its way.
    const ok = await submit(db, body, actor, key, { publish, rateLimit: allowAll, indicative: noEstimate });
    expect(ok).toMatchObject({ ok: true, created: true });
  });

  it("the same Idempotency-Key twice at once: one request, and the second call returns the first", async () => {
    const key = `idem-${crypto.randomUUID()}`;
    // Make the race certain: whichever call publishes first holds its transaction open, so the other passes both
    // checks (the row is not committed yet) and reaches its insert while the first row is still in flight.
    let publishes = 0;
    const slowFirst = async (tx: Executor, e: PublishInput) => {
      if (++publishes === 1) await Bun.sleep(300);
      await publish(tx, e);
    };
    const [a, b] = await Promise.all([
      submit(db, body, actor, key, { publish: slowFirst, rateLimit: allowAll, indicative: noEstimate }),
      submit(db, body, actor, key, { publish: slowFirst, rateLimit: allowAll, indicative: noEstimate }),
    ]);
    const results = [a, b].map((r) => (r.ok ? { created: r.created, id: r.request.id } : { code: r.code }));
    expect(results.map((r) => ("created" in r ? r.created : r.code)).sort()).toEqual([false, true]);
    expect(new Set(results.map((r) => ("id" in r ? r.id : null))).size).toBe(1);
    expect(await count(sql`SELECT count(*)::int AS n FROM requests.requests WHERE idempotency_key = ${key}`)).toBe(1);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM platform.domain_events
                      WHERE type = 'request.submitted' AND payload->>'requestId' = ${results[0] && "id" in results[0] ? results[0].id : ""}`),
    ).toBe(1);
  });

  it("a quote whose app showed the estimate keeps the catalog's number; a fare request and a replay never ask", async () => {
    const asked: { from: string; to: string; cabin: string }[] = [];
    const estimate = async (q: { from: string; to: string; cabin: "business" | "first" }) => {
      asked.push(q);
      return { amount: 2055, currency: "USD" as const, cabin: q.cabin, rules: "0123456789abcdef" };
    };
    const round = {
      ...body,
      tripType: "round",
      legs: [
        { from: "JFK", to: "ZRH", date: "2027-10-12" },
        { from: "ZRH", to: "JFK", date: "2027-10-19" },
      ],
      estimateShown: true,
      // Not in RequestBody: dropped by the parse, never stored.
      estimate: { amount: 1, currency: "USD" },
      price: 1,
    };
    const key = `idem-${crypto.randomUUID()}`;
    const quote = await submit(db, round, actor, key, { publish, rateLimit: allowAll, indicative: estimate });
    expect(quote).toMatchObject({ ok: true, created: true });
    expect(asked).toEqual([{ from: "JFK", to: "ZRH", cabin: "business" }]);
    const [row] = (await db.execute(
      sql`SELECT shown_estimate_amount AS amount, shown_estimate_currency AS currency FROM requests.requests
          WHERE idempotency_key = ${key}`,
    )) as unknown as { amount: number; currency: string }[];
    expect(row).toEqual({ amount: 2055, currency: "USD" });
    const [journal] = (await db.execute(
      sql`SELECT payload FROM platform.domain_events
          WHERE type = 'request.submitted' AND payload->>'requestId' = ${quote.ok ? quote.request.id : ""}`,
    )) as unknown as { payload: { shownEstimate: unknown } }[];
    expect(journal?.payload.shownEstimate).toEqual({ amount: 2055, currency: "USD", rules: "0123456789abcdef" });

    const replay = await submit(db, round, actor, key, { publish, rateLimit: allowAll, indicative: estimate });
    expect(replay).toMatchObject({ ok: true, created: false });
    const fare = await submit(
      db,
      { ...round, fareId: "11111111-1111-4111-8111-111111111111" },
      actor,
      `idem-${crypto.randomUUID()}`,
      { publish, rateLimit: allowAll, indicative: estimate },
    );
    expect(fare).toMatchObject({ ok: true, created: true });
    const alternative = await submit(
      db,
      { ...round, intent: "alternative", replacesFareId: "11111111-1111-4111-8111-111111111111" },
      actor,
      `idem-${crypto.randomUUID()}`,
      { publish, rateLimit: allowAll, indicative: estimate },
    );
    expect(alternative).toMatchObject({ ok: true, created: true });
    expect(asked).toHaveLength(1);
  });

  it("a quote whose app did not show an estimate never asks — an older app, a dated search, an offer card", async () => {
    const asked: unknown[] = [];
    const estimate = async (q: { from: string; to: string; cabin: "business" | "first" }) => {
      asked.push(q);
      return { amount: 2055, currency: "USD" as const, cabin: q.cabin };
    };
    for (const shown of [undefined, false]) {
      const key = `idem-${crypto.randomUUID()}`;
      const quote = await submit(
        db,
        { ...body, intent: "quote", ...(shown === undefined ? {} : { estimateShown: shown }) },
        actor,
        key,
        { publish, rateLimit: allowAll, indicative: estimate },
      );
      expect(quote).toMatchObject({ ok: true, created: true });
      const [row] = (await db.execute(
        sql`SELECT shown_estimate_amount AS amount FROM requests.requests WHERE idempotency_key = ${key}`,
      )) as unknown as { amount: number | null }[];
      expect(row?.amount).toBeNull();
    }
    expect(asked).toEqual([]);
  });

  it("a rate-limited quote stops before the estimate: the limit costs no catalog read", async () => {
    const asked: unknown[] = [];
    const estimate = async (q: { from: string; to: string; cabin: "business" | "first" }) => {
      asked.push(q);
      return { amount: 2055, currency: "USD" as const, cabin: q.cabin };
    };
    const limited = await submit(
      db,
      { ...body, intent: "quote", estimateShown: true },
      actor,
      `idem-${crypto.randomUUID()}`,
      { publish, rateLimit: { check: async () => ({ allowed: false, retryAfterMs: 1000 }) }, indicative: estimate },
    );
    expect(limited).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(asked).toEqual([]);
  });
});
