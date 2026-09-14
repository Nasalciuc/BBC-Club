import { describe, it, expect, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { offers } from "../src/schema/proposals";
import { bumpCounter } from "../src/helpers";
import { rateLimits } from "@bbc/platform/schema";

/** drizzle-orm@1.0.0-rc.4 query builders are thenables but Bun's expect().rejects does not always
 *  recognise them — await inside try/catch instead. */
async function expectDbReject(run: () => PromiseLike<unknown>, re: RegExp) {
  try {
    await run();
    throw new Error("expected database to reject");
  } catch (e) {
    const text =
      e instanceof Error ? `${e.message}\n${String((e as Error & { cause?: unknown }).cause ?? "")}` : String(e);
    expect(text).toMatch(re);
  }
}

/** The invariants live in Postgres. These tests prove the database refuses bad data without any application code. */
const db = createDb(process.env.DATABASE_URL!, { max: 2, applicationName: "bbc-test" });
afterAll(() => db.close());

describe("proposals.offers invariants", () => {
  const base = {
    idempotencyKey: `t-${Date.now()}`,
    source: "crm_agent" as const,
    targeting: "broadcast" as const,
    routeFrom: "JFK",
    routeTo: "LHR",
    cabin: "business" as const,
    price: "4200.00",
    title: "x",
    validUntil: new Date(Date.now() + 86_400_000),
  };
  it("refuses price <= 0", async () => {
    await expectDbReject(
      () => db.insert(offers).values({ ...base, idempotencyKey: base.idempotencyKey + "a", price: "0" }),
      /offers_price_pos/,
    );
  });
  it("refuses published_price below price", async () => {
    await expectDbReject(
      () => db.insert(offers).values({ ...base, idempotencyKey: base.idempotencyKey + "b", publishedPrice: "100.00" }),
      /offers_published_gte_price/,
    );
  });
  it("refuses targeting=user without target_member_id (true XOR)", async () => {
    await expectDbReject(
      () => db.insert(offers).values({ ...base, idempotencyKey: base.idempotencyKey + "c", targeting: "user" }),
      /offers_targeting_consistent/,
    );
  });
  it("refuses a second offer with the same idempotency key", async () => {
    await db.insert(offers).values({ ...base, idempotencyKey: base.idempotencyKey + "d" });
    await expectDbReject(
      () => db.insert(offers).values({ ...base, idempotencyKey: base.idempotencyKey + "d" }),
      /offers_idempotency/,
    );
  });
  it("refuses an unknown enum value even via raw SQL", async () => {
    await expectDbReject(
      () => db.execute(sql`UPDATE proposals.offers SET status = 'activ' WHERE false`),
      /invalid input value for enum/,
    );
  });
});

describe("atomic counters", () => {
  it("bumpCounter never loses increments under concurrency", async () => {
    const key = `test:${Date.now()}`;
    const exp = new Date(Date.now() + 60_000);
    await Promise.all(
      Array.from({ length: 25 }, () =>
        bumpCounter(db, rateLimits, { key, windowStart: new Date(), expiresAt: exp }, rateLimits.count, [
          rateLimits.key,
        ]),
      ),
    );
    const [{ count }] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(sql`${rateLimits.key} = ${key}`);
    expect(count).toBe(25);
  });
  it("bumpCounter with cap returns null once exhausted", async () => {
    const key = `cap:${Date.now()}`;
    const exp = new Date(Date.now() + 60_000);
    const results = [] as (number | null)[];
    for (let i = 0; i < 5; i++)
      results.push(
        await bumpCounter(
          db,
          rateLimits,
          { key, windowStart: new Date(), expiresAt: exp },
          rateLimits.count,
          [rateLimits.key],
          3,
        ),
      );
    expect(results).toEqual([1, 2, 3, null, null]);
  });
});
