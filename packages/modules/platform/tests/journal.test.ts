import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";

/** These tests are the contract of the whole system: every module's correctness rests on them. */
let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-journal", { max: 4 });
  db = iso.db;
});
afterAll(() => iso.drop());

const Payload = z.object({ type: z.literal("test.happened"), version: z.literal(1), value: z.string() });

function platformWith(handler: (ctx: any, p: any) => Promise<void>, consumer = "testing.onHappened") {
  const p = createPlatform(db, { level: "silent" });
  p.events.defineEvent("test.happened", { version: 1, schema: Payload });
  p.events.registerConsumer("test.happened", consumer, handler);
  return p;
}
const emit = (p: any, value = "v") =>
  db.transaction((tx: any) =>
    p.events.publish(tx, {
      type: "test.happened",
      aggregateType: "test",
      aggregateId: `agg-${value}`,
      payload: { type: "test.happened", version: 1, value },
      publishedBy: "tests",
    }),
  );

beforeEach(async () => {
  await db.execute(sql`TRUNCATE platform.event_deliveries, platform.event_dlq RESTART IDENTITY`);
  await db.execute(sql`DELETE FROM platform.domain_events WHERE type = 'test.happened'`);
});

describe("publish", () => {
  it("writes nothing when the caller's transaction rolls back", async () => {
    const p = platformWith(async () => {});
    await db
      .transaction(async (tx: any) => {
        await p.events.publish(tx, {
          type: "test.happened",
          aggregateType: "test",
          aggregateId: "a",
          payload: { type: "test.happened", version: 1, value: "x" },
          publishedBy: "tests",
        });
        throw new Error("rollback");
      })
      .catch(() => {});
    const [{ n }]: any = await db.execute(
      sql`SELECT count(*)::int n FROM platform.domain_events WHERE type='test.happened'`,
    );
    expect(n).toBe(0);
  });

  it("creates exactly one delivery per registered consumer", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.events.defineEvent("test.happened", { version: 1, schema: Payload });
    p.events.registerConsumer("test.happened", "a.onHappened", async () => {});
    p.events.registerConsumer("test.happened", "b.onHappened", async () => {});
    const r = await emit(p);
    expect(r.deliveries).toBe(2);
  });

  it("rejects an unknown type and an invalid payload at the source", async () => {
    const p = platformWith(async () => {});
    await expect(
      db.transaction((tx: any) =>
        p.events.publish(tx, { type: "nope", aggregateType: "t", aggregateId: "a", payload: {}, publishedBy: "tests" }),
      ),
    ).rejects.toThrow(/unknown event type/);
    await expect(
      db.transaction((tx: any) =>
        p.events.publish(tx, {
          type: "test.happened",
          aggregateType: "t",
          aggregateId: "a",
          payload: { type: "test.happened", version: 1 },
          publishedBy: "tests",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("poller", () => {
  it("delivers once and commits handler writes with the delivery", async () => {
    let calls = 0;
    const p = platformWith(async ({ tx }) => {
      calls++;
      await tx.execute(sql`SELECT 1`);
    });
    await emit(p);
    expect(await p.poller.drainOnce()).toBe(1);
    expect(await p.poller.drainOnce()).toBe(0); // nothing left: delivery is done
    expect(calls).toBe(1);
  });

  it("rolls back handler writes when the handler throws, then retries with backoff", async () => {
    let attempts = 0;
    const p = platformWith(async ({ tx, attempt }) => {
      attempts = attempt;
      await tx.execute(
        sql`INSERT INTO platform.flags (key, value) VALUES ('side.effect', '{"enabled":true}') ON CONFLICT (key) DO NOTHING`,
      );
      throw new Error("boom");
    });
    await emit(p);
    await p.poller.processOne();
    const [{ n }]: any = await db.execute(sql`SELECT count(*)::int n FROM platform.flags WHERE key='side.effect'`);
    expect(n).toBe(0); // side effect rolled back
    expect(attempts).toBe(1);
    const [d]: any = await db.execute(
      sql`SELECT attempts, status, run_after > now() AS scheduled FROM platform.event_deliveries LIMIT 1`,
    );
    expect(d.attempts).toBe(1);
    expect(d.status).toBe("pending");
    expect(d.scheduled).toBe(true);
  });

  it("dead-letters after the last attempt", async () => {
    const p = platformWith(async () => {
      throw new Error("always");
    });
    await emit(p);
    for (let i = 0; i < 7; i++) {
      await db.execute(
        sql`UPDATE platform.event_deliveries SET run_after = now() - interval '1 second' WHERE status='pending'`,
      );
      await p.poller.processOne();
    }
    const [d]: any = await db.execute(sql`SELECT status, attempts FROM platform.event_deliveries LIMIT 1`);
    const [{ n }]: any = await db.execute(sql`SELECT count(*)::int n FROM platform.event_dlq`);
    expect(d.status).toBe("dead");
    expect(d.attempts).toBe(7);
    expect(n).toBe(1);
  });

  it("replay puts a dead delivery back in the queue", async () => {
    const p = platformWith(async () => {
      throw new Error("always");
    });
    await emit(p);
    for (let i = 0; i < 7; i++) {
      await db.execute(
        sql`UPDATE platform.event_deliveries SET run_after = now() - interval '1 second' WHERE status='pending'`,
      );
      await p.poller.processOne();
    }
    const [d]: any = await db.execute(sql`SELECT id FROM platform.event_deliveries LIMIT 1`);
    await p.poller.replay(d.id);
    const [after]: any = await db.execute(sql`SELECT status, attempts FROM platform.event_deliveries LIMIT 1`);
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(0);
  });

  it("two pollers in parallel deliver each event exactly once", async () => {
    const seen: string[] = [];
    const mk = () =>
      platformWith(async (_ctx, payload) => {
        seen.push(payload.value);
        await new Promise((r) => setTimeout(r, 20));
      });
    const p1 = mk(),
      p2 = mk();
    for (let i = 0; i < 20; i++) await emit(p1, `e${i}`);
    await Promise.all([p1.drainAll?.() ?? p1.poller.drainOnce(), p2.poller.drainOnce()]);
    expect(seen.length).toBe(20);
    expect(new Set(seen).size).toBe(20);
  });

  it("preserves order per aggregate", async () => {
    const order: string[] = [];
    const p = platformWith(async (ctx, payload) => {
      order.push(`${ctx.event.aggregateId}:${payload.value}`);
    });
    await db.transaction(async (tx: any) => {
      for (const v of ["1", "2", "3"])
        await p.events.publish(tx, {
          type: "test.happened",
          aggregateType: "test",
          aggregateId: "same",
          payload: { type: "test.happened", version: 1, value: v },
          publishedBy: "tests",
        });
    });
    await p.poller.drainOnce();
    expect(order).toEqual(["same:1", "same:2", "same:3"]);
  });

  it("a paused consumer stops receiving, resume puts deliveries back", async () => {
    let calls = 0;
    const p = platformWith(async () => {
      calls++;
    });
    await p.flags.set("consumer.testing.onHappened.paused", { enabled: true });
    await emit(p);
    await p.poller.drainOnce();
    expect(calls).toBe(0);
    await p.flags.set("consumer.testing.onHappened.paused", { enabled: false });
    await p.poller.resume("testing.onHappened");
    await p.poller.drainOnce();
    expect(calls).toBe(1);
  });

  it("handler timeout aborts the signal so the handler can stop working", async () => {
    let exited = false;
    const p = createPlatform(db, { level: "silent", handlerTimeoutMs: 200 });
    p.events.defineEvent("test.happened", { version: 1, schema: Payload });
    p.events.registerConsumer("test.happened", "testing.onTimeout", async (ctx) => {
      while (!ctx.signal.aborted) await new Promise((r) => setTimeout(r, 50));
      exited = true;
    });
    await db.transaction((tx: any) =>
      p.events.publish(tx, {
        type: "test.happened",
        aggregateType: "test",
        aggregateId: "timeout",
        payload: { type: "test.happened", version: 1, value: "t" },
        publishedBy: "tests",
      }),
    );
    const t0 = Date.now();
    await p.poller.processOne();
    // wait for the loop to notice abort (race rejects; handler exits on next sleep tick)
    for (let i = 0; i < 20 && !exited; i++) await new Promise((r) => setTimeout(r, 50));
    expect(exited).toBe(true);
    expect(Date.now() - t0).toBeLessThan(800);
    const [d]: any = await db.execute(
      sql`SELECT status, attempts FROM platform.event_deliveries WHERE aggregate_id='timeout' LIMIT 1`,
    );
    expect(d.status).toBe("pending");
    expect(d.attempts).toBe(1);
  });
});

describe("versioning", () => {
  it("upcasts an old payload before validating", async () => {
    const p = createPlatform(db, { level: "silent" });
    const V2 = z.object({
      type: z.literal("test.versioned"),
      version: z.literal(2),
      value: z.string(),
      extra: z.string(),
    });
    p.events.defineEvent("test.versioned", {
      version: 2,
      schema: V2,
      upcasters: { 1: (old: any) => ({ ...old, version: 2, extra: "default" }) },
    });
    let got: any;
    p.events.registerConsumer("test.versioned", "testing.onVersioned", async (_c, payload) => {
      got = payload;
    });
    await db.execute(sql`INSERT INTO platform.domain_events (type, version, aggregate_type, aggregate_id, payload, published_by)
                         VALUES ('test.versioned', 1, 'test', 'v1', '{"type":"test.versioned","version":1,"value":"old"}', 'tests')`);
    const [e]: any = await db.execute(
      sql`SELECT id, occurred_at FROM platform.domain_events WHERE type='test.versioned' LIMIT 1`,
    );
    await db.execute(
      sql`INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id) VALUES (${e.id}, ${e.occurred_at}, 'testing.onVersioned', 'v1')`,
    );
    await p.poller.drainOnce();
    expect(got).toEqual({ type: "test.versioned", version: 2, value: "old", extra: "default" });
  });
});

describe("tombstone", () => {
  it("removes identifying payloads for a deleted member but keeps the facts", async () => {
    const p = platformWith(async () => {});
    await db.transaction(async (tx: any) =>
      p.events.publish(tx, {
        type: "test.happened",
        aggregateType: "test",
        aggregateId: "t",
        memberId: "m-1",
        payload: { type: "test.happened", version: 1, value: "alex@example.com" },
        publishedBy: "tests",
      }),
    );
    await db.transaction((tx: any) => p.events.tombstoneMember(tx, "m-1"));
    const [row]: any = await db.execute(sql`SELECT type, payload FROM platform.domain_events WHERE member_id='m-1'`);
    expect(row.type).toBe("test.happened");
    expect(JSON.stringify(row.payload)).not.toContain("alex@example.com");
    expect(row.payload.tombstoned).toBe(true);
  });
});
