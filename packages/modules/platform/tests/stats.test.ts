import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-stats", { max: 4 });
  db = iso.db;
});
afterAll(() => iso.drop());

function sqlText(q: any): string {
  const chunks = q?.queryChunks as any[] | undefined;
  if (!chunks) return "";
  return chunks
    .map((c) => (Array.isArray(c?.value) ? c.value.join("") : typeof c?.value === "string" ? c.value : ""))
    .join("");
}

describe("delivery stats", () => {
  it("one scrape runs stats() once", async () => {
    let statsQueries = 0;
    const wrapped = new Proxy(db, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== "execute" || typeof value !== "function")
          return typeof value === "function" ? value.bind(target) : value;
        return (q: any, ...rest: any[]) => {
          if (sqlText(q).includes("oldest_pending_s")) statsQueries++;
          return value.call(target, q, ...rest);
        };
      },
    });
    const p = createPlatform(wrapped, { level: "silent" });
    await p.metrics.render();
    expect(statsQueries).toBe(1);
    await p.metrics.render();
    expect(statsQueries).toBe(1);
  });

  it("stats() uses the partial delivery indexes", async () => {
    const plan = (await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return tx.execute(sql`
        EXPLAIN SELECT (SELECT count(*) FROM platform.event_deliveries WHERE status = 'pending')::int AS pending,
                      (SELECT count(*) FROM platform.event_deliveries WHERE status = 'dead')::int AS dead,
                      (SELECT count(*) FROM platform.event_deliveries WHERE status = 'paused')::int AS paused,
                      COALESCE(EXTRACT(EPOCH FROM now() - (SELECT min(created_at) FROM platform.event_deliveries
                                                           WHERE status = 'pending'))::int, 0) AS oldest_pending_s`);
    })) as { "QUERY PLAN": string }[];
    const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
    expect(text).toContain("deliveries_pending_created");
    expect(text).toContain("deliveries_dead");
    expect(text).toContain("deliveries_paused");
  });
});
