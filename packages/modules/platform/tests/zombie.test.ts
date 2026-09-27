import { it, expect, beforeAll, afterAll } from "bun:test";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";
let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-zombie-main", { max: 4 });
  db = iso.db;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS public.zprobe (v text PRIMARY KEY)`);
});
afterAll(() => iso.drop());
const Payload = z.object({ type: z.literal("test.happened"), version: z.literal(1), value: z.string() });
it("a handler that outlives its timeout must not write after the rollback", async () => {
  const p = createPlatform(db, { level: "silent", handlerTimeoutMs: 100 });
  p.events.defineEvent("test.happened", { version: 1, schema: Payload });
  p.events.registerConsumer("test.happened", "testing.onHappened", async (ctx: any) => {
    await Bun.sleep(300); // outlives the 100 ms timeout
    await ctx.tx.execute(sql`INSERT INTO public.zprobe (v) VALUES ('zombie')`).catch(() => {});
  });
  await db.transaction((tx: any) =>
    p.events.publish(tx, {
      type: "test.happened",
      aggregateType: "t",
      aggregateId: "a",
      payload: { type: "test.happened", version: 1, value: "x" },
      publishedBy: "tests",
    }),
  );
  await p.poller.processOne(); // times out → rollback → attempts=1
  await Bun.sleep(400); // the abandoned handler wakes up and writes
  const rows = (await db.execute(sql`SELECT v FROM public.zprobe`)) as any[];
  expect(rows.map((r) => r.v)).not.toContain("zombie");
});
