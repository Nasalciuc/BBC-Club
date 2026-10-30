/** ADR-IMPL-080 (H1): a pause flag that cannot be read leaves a delivery pending, never parked; a delivery parked while
 *  its flag said paused goes back to pending once the flag no longer does; `queue_paused` counts the parked ones. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform, registerPlatformJobs } from "../src/api";
import { resumeParked } from "../src/jobs/builtin";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-poller-pause", { max: 4 });
  db = iso.db;
});
afterAll(() => iso.drop());

const CONSUMER = "testing.onPaused";
const Payload = z.object({ type: z.literal("test.paused"), version: z.literal(1), value: z.string() });
const platform = () => {
  const p = createPlatform(db, { level: "silent" });
  p.events.defineEvent("test.paused", { version: 1, schema: Payload });
  p.events.registerConsumer("test.paused", CONSUMER, async () => {});
  registerPlatformJobs(p.jobs, p.metrics);
  return p;
};
const emit = (p: ReturnType<typeof platform>, value: string) =>
  db.transaction((tx: any) =>
    p.events.publish(tx, {
      type: "test.paused",
      aggregateType: "test",
      aggregateId: `agg-${value}`,
      payload: { type: "test.paused", version: 1, value },
      publishedBy: "tests",
    }),
  );
const deliveries = async () =>
  (await db.execute(sql`
    SELECT status, (run_after > now() + interval '3 seconds') AS later
    FROM platform.event_deliveries WHERE consumer = ${CONSUMER}`)) as unknown as { status: string; later: boolean }[];

beforeEach(async () => {
  await db.execute(sql`TRUNCATE platform.event_deliveries, platform.event_dlq RESTART IDENTITY`);
  await db.execute(sql`DELETE FROM platform.domain_events WHERE type = 'test.paused'`);
  await db.execute(sql`DELETE FROM platform.flags WHERE key = ${`consumer.${CONSUMER}.paused`}`);
});

describe("a consumer's pause (ADR-IMPL-080)", () => {
  it("(a) flags that cannot be read leave the delivery pending, tried again later — never parked", async () => {
    const p = platform();
    await emit(p, "a");
    // Another connection holds platform.generations: this process has never read its counters, so no flag is trusted.
    const locker = postgres(iso.url, { max: 1, onnotice: () => {} });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = locker.begin(async (tx) => {
      await tx`LOCK TABLE platform.generations IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      await p.poller.drainOnce(10);
      expect(await deliveries()).toEqual([{ status: "pending", later: true }]);
    } finally {
      release.resolve();
      await held;
      await locker.end();
    }
  }, 20_000);

  it("(b) a flag that says paused parks the delivery; (c) once the flag is gone, queue-health puts it back", async () => {
    const p = platform();
    await p.flags.set(`consumer.${CONSUMER}.paused`, { enabled: true });
    await emit(p, "b");
    await p.poller.drainOnce(10);
    expect((await deliveries()).map((d) => d.status)).toEqual(["paused"]);
    expect(await p.metrics.render()).toMatch(/queue_paused\{[^}]*\} 1\b|queue_paused 1\b/);

    await db.execute(sql`DELETE FROM platform.flags WHERE key = ${`consumer.${CONSUMER}.paused`}`);
    const run = await p.jobs.run("queue-health");
    expect(run.error ?? run.status).toBe("succeeded");
    expect(run.metrics?.resumed).toBe(1);
    expect((await deliveries()).map((d) => d.status)).toEqual(["pending"]);
  });

  it("queue-health leaves alone a delivery whose flag still says paused", async () => {
    const p = platform();
    await p.flags.set(`consumer.${CONSUMER}.paused`, { enabled: true });
    await emit(p, "c");
    await p.poller.drainOnce(10);
    const run = await p.jobs.run("queue-health");
    expect(run.metrics?.resumed).toBe(0);
    expect((await deliveries()).map((d) => d.status)).toEqual(["paused"]);
  });

  it("queue-health reads paused as JSON true, as the flags reader does: another value written by hand resumes", async () => {
    const p = platform();
    const key = `consumer.${CONSUMER}.paused`;
    await p.flags.set(key, { enabled: true });
    await emit(p, "e");
    await p.poller.drainOnce(10);
    expect((await deliveries()).map((d) => d.status)).toEqual(["paused"]);
    // None is a pause to consumerPauseState: the reader's parser rejects the third, and a cast to boolean failed on
    // the first and took the second as true.
    for (const value of ['{"enabled":"later"}', '{"enabled":"true"}', '{"enabled":true,"variant":null}']) {
      await db.execute(sql`UPDATE platform.event_deliveries SET status = 'paused'`);
      await db.execute(sql`UPDATE platform.flags SET value = ${value}::jsonb WHERE key = ${key}`);
      const run = await p.jobs.run("queue-health");
      expect(run.metrics?.resumed).toBe(1);
      expect((await deliveries()).map((d) => d.status)).toEqual(["pending"]);
    }
  });

  it("queue-health resumes in batches, each committed: a stop part-way keeps what it resumed, the next run the rest", async () => {
    const p = platform();
    await p.flags.set(`consumer.${CONSUMER}.paused`, { enabled: true });
    for (const v of ["f1", "f2", "f3", "f4", "f5"]) await emit(p, v);
    await p.poller.drainOnce(10);
    expect((await deliveries()).map((d) => d.status)).toEqual(Array(5).fill("paused"));
    await db.execute(sql`DELETE FROM platform.flags WHERE key = ${`consumer.${CONSUMER}.paused`}`);

    // Time up after the first batch: two resumed and kept, three still parked, and it says it stopped.
    expect(await resumeParked(db, [CONSUMER], { batch: 2, budgetMs: 0 })).toEqual({ resumed: 2, capped: true });
    const statuses = async () => (await deliveries()).map((d) => d.status).sort();
    expect(await statuses()).toEqual(["paused", "paused", "paused", "pending", "pending"]);
    // A job stopped by its timeout: no batch after the signal.
    const stopped = new AbortController();
    stopped.abort();
    expect(await resumeParked(db, [CONSUMER], { batch: 2, signal: stopped.signal })).toEqual({
      resumed: 2,
      capped: true,
    });
    // With time, batch after batch until one comes back short: the last one, then nothing more to do.
    expect(await resumeParked(db, [CONSUMER], { batch: 2 })).toEqual({ resumed: 1, capped: false });
    expect(await statuses()).toEqual(Array(5).fill("pending"));
    expect(await resumeParked(db, [CONSUMER], { batch: 2 })).toEqual({ resumed: 0, capped: false });

    // The job itself, as it runs: everything back in one run, nothing capped.
    await db.execute(sql`UPDATE platform.event_deliveries SET status = 'paused'`);
    const run = await p.jobs.run("queue-health");
    expect(run.metrics?.resumed).toBe(5);
    expect(run.metrics?.resumeCapped).toBe(0);
  });

  it("(d) /metrics carries queue_paused", async () => {
    const p = platform();
    expect(await p.metrics.render()).toContain("queue_paused");
  });
});
