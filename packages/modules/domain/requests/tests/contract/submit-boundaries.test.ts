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
    await expect(submit(db, body, actor, key, { publish: failing, rateLimit: allowAll })).rejects.toBe(injected);
    expect(await count(sql`SELECT count(*)::int AS n FROM requests.requests WHERE idempotency_key = ${key}`)).toBe(0);
    expect(await count(sql`SELECT count(*)::int AS n FROM requests.request_events`)).toBe(0);
    expect(
      await count(sql`SELECT count(*)::int AS n FROM platform.domain_events WHERE type = 'request.submitted'`),
    ).toBe(0);

    // The same key then goes through: nothing half-written stands in its way.
    const ok = await submit(db, body, actor, key, { publish, rateLimit: allowAll });
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
      submit(db, body, actor, key, { publish: slowFirst, rateLimit: allowAll }),
      submit(db, body, actor, key, { publish: slowFirst, rateLimit: allowAll }),
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
});
