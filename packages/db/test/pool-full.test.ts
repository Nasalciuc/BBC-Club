/** createDb({ max: 2 }) queues the third waiter; statement_timeout still bounds runaways; pooled clients set prepare false. */
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "../src/testing/isolated-db";
import { createDb } from "../src/client";

describe("pool full", () => {
  test("a third query waits until a reserved connection is released", async () => {
    const iso = await isolatedDb("db-pool-full", { max: 2 });
    const db = createDb(iso.url, { max: 2, applicationName: "pool-full" });
    const a = await db.raw.reserve();
    const b = await db.raw.reserve();
    const started = Date.now();
    const third = db.execute(sql`SELECT 1 AS n`);
    await Bun.sleep(80);
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
    a.release();
    b.release();
    const rows = (await third) as unknown as { n: number }[];
    expect(Number(rows[0]?.n)).toBe(1);
    await db.close();
    await iso.drop();
  }, 15_000);

  test("statement_timeout on a direct client cancels pg_sleep(20)", async () => {
    const iso = await isolatedDb("db-pool-timeout", { max: 1 });
    const db = createDb(iso.url, { max: 1, applicationName: "pool-timeout" });
    const t0 = performance.now();
    let code = "";
    try {
      await db.execute(sql`SELECT pg_sleep(20)`);
    } catch (e: any) {
      code = String(e?.cause?.code ?? e?.code ?? "");
    }
    await db.close();
    await iso.drop();
    expect(code).toBe("57014");
    expect((performance.now() - t0) / 1000).toBeLessThan(18);
  }, 25_000);

  test("transaction pooler option disables prepare", () => {
    const url = process.env.DATABASE_URL ?? "postgres://bbc:bbc@localhost:55432/bbc_test";
    const db = createDb(url, { pooler: "transaction", max: 1 });
    expect((db.raw as { options?: { prepare?: boolean } }).options?.prepare).toBe(false);
    void db.close();
  });
});
