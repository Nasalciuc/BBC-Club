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

  it("stats() stays under 20ms with a million done deliveries", async () => {
    await db.execute(sql`
      INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id, status, processed_at)
      SELECT g, now(), 'bench.noop', g::text, 'done', now()
      FROM generate_series(1, 1000000) g
    `);
    const p = createPlatform(db, { level: "silent" });
    await p.poller.stats();
    const t0 = performance.now();
    const s = await p.poller.stats();
    const ms = performance.now() - t0;
    expect(s.pending).toBe(0);
    expect(ms).toBeLessThan(20);
  }, 120_000);
});
