import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-poller-batch", { max: 4 });
  db = iso.db;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS public.batch_probe (v text PRIMARY KEY)`);
});
afterAll(() => iso.drop());

const Payload = z.object({ type: z.literal("test.happened"), version: z.literal(1), value: z.string() });
const emit = (p: any, value: string) =>
  db.transaction((tx: any) =>
    p.events.publish(tx, {
      type: "test.happened",
      aggregateType: "test",
      aggregateId: `agg-${value}`,
      payload: { type: "test.happened", version: 1, value },
      publishedBy: "tests",
    }),
  );
const status = async () =>
  (await db.execute(sql`SELECT d.status, d.attempts, e.payload->>'value' AS v FROM platform.event_deliveries d
    JOIN platform.domain_events e ON e.id = d.event_id ORDER BY v`)) as any[];
const probes = async () =>
  ((await db.execute(sql`SELECT v FROM public.batch_probe ORDER BY v`)) as any[]).map((r) => r.v);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE platform.event_deliveries, platform.event_dlq, public.batch_probe RESTART IDENTITY`);
  await db.execute(sql`DELETE FROM platform.domain_events WHERE type = 'test.happened'`);
});

describe("poller batch (savepoint per delivery)", () => {
  it("a poison event rolls back only its own writes; the rest of the batch commits", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.events.defineEvent("test.happened", { version: 1, schema: Payload });
    p.events.registerConsumer("test.happened", "testing.onHappened", async (ctx: any, pl: any) => {
      await ctx.tx.execute(sql`INSERT INTO public.batch_probe (v) VALUES (${pl.value})`);
      if (pl.value === "c") throw new Error("poison");
    });
    for (const v of ["a", "b", "c", "d", "e"]) await emit(p, v);
    await p.poller.drainOnce(5); // one batch claims all five
    const s = await status();
    expect(s.map((r) => `${r.v}:${r.status}:${r.attempts}`)).toEqual([
      "a:done:1",
      "b:done:1",
      "c:pending:1",
      "d:done:1",
      "e:done:1",
    ]);
    expect(await probes()).toEqual(["a", "b", "d", "e"]); // c's insert is gone with its savepoint
  });

  it("a timeout aborts the whole batch (no zombie writes), then records the failure", async () => {
    const p = createPlatform(db, { level: "silent", handlerTimeoutMs: 100 });
    p.events.defineEvent("test.happened", { version: 1, schema: Payload });
    p.events.registerConsumer("test.happened", "testing.onHappened", async (ctx: any, pl: any) => {
      if (pl.value === "b") {
        await Bun.sleep(300);
        await ctx.tx.execute(sql`INSERT INTO public.batch_probe (v) VALUES ('zombie')`).catch(() => {});
        return;
      }
      await ctx.tx.execute(sql`INSERT INTO public.batch_probe (v) VALUES (${pl.value})`);
    });
    for (const v of ["a", "b", "c"]) await emit(p, v);
    const n = await p.poller.drainOnce(1); // first batch only
    expect(n).toBe(1);
    await Bun.sleep(400); // let the abandoned handler try to write
    const s = await status();
    expect(s.find((r) => r.v === "a")!.status).toBe("pending"); // rolled back with the batch
    expect(s.find((r) => r.v === "b")).toMatchObject({ status: "pending", attempts: 1 });
    expect(await probes()).not.toContain("zombie");
    expect(await probes()).not.toContain("a");
  });
});
