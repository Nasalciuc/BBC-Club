/** ADR-IMPL-075: reference-table counters, the snapshots and memos built on them, and the triggers that bump them. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createGenerationMemo, createGenerations, createSnapshot } from "../src/generations";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-generations", { max: 2 });
});
afterAll(() => iso.drop());

const counter = async (key: string) => {
  const rows = (await iso.db.execute(sql`SELECT value FROM platform.generations WHERE key = ${key}`)) as unknown as {
    value: string;
  }[];
  return Number(rows[0]?.value ?? -1);
};

describe("the triggers", () => {
  it("every reference table bumps its counter once per statement, in the writing transaction", async () => {
    const before = await Promise.all(
      ["platform.flags", "catalog.airports", "catalog.fares", "catalog.site"].map(counter),
    );
    await iso.db.execute(sql`INSERT INTO platform.flags (key, value) VALUES ('g.one', '{}'), ('g.two', '{}')`);
    await iso.db.execute(sql`UPDATE catalog.airports SET popularity = popularity WHERE code IN ('LHR', 'JFK')`);
    await iso.db.execute(sql`UPDATE catalog.fares SET price = price WHERE false`);
    await iso.db.execute(sql`DELETE FROM catalog.site_routes WHERE false`);
    await iso.db.execute(sql`DELETE FROM catalog.site_places WHERE false`);
    const after = await Promise.all(
      ["platform.flags", "catalog.airports", "catalog.fares", "catalog.site"].map(counter),
    );
    expect(after).toEqual([before[0]! + 1, before[1]! + 1, before[2]! + 1, before[3]! + 2]);
  });

  it("a rolled back write leaves the counter as it was", async () => {
    const before = await counter("platform.flags");
    await iso.db
      .transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO platform.flags (key, value) VALUES ('g.rolled', '{}')`);
        throw new Error("roll back");
      })
      .catch(() => undefined);
    expect(await counter("platform.flags")).toBe(before);
  });
});

describe("createGenerations", () => {
  it("asks Postgres at most once a second, whatever the number of callers", async () => {
    let clock = 10_000;
    let reads = 0;
    // A read is one short transaction (SET LOCAL statement_timeout, then the counters).
    const db = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "transaction")
          return (...a: unknown[]) => {
            reads += 1;
            return (v as (...x: unknown[]) => unknown).apply(t, a);
          };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const g = createGenerations(db, { now: () => clock });
    expect(g.staleMs()).toBe(Number.POSITIVE_INFINITY);
    await Promise.all(Array.from({ length: 50 }, () => g.current("platform.flags")));
    expect(reads).toBe(1);
    clock += 999;
    await g.current("platform.flags");
    expect(reads).toBe(1);
    clock += 2;
    await g.current("platform.flags"); // starts the read; this caller answers from what is held
    expect(reads).toBe(2);
    g.invalidate();
    await g.current("platform.flags");
    expect(reads).toBe(3);
    expect(g.staleMs()).toBe(0);
  });

  it("a read that fails keeps the last counters, and staleMs grows", async () => {
    let clock = 20_000;
    let down = false;
    const db = new Proxy(iso.db, {
      get(t, k) {
        if (k === "transaction" && down) return () => Promise.reject(new Error("db down"));
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const g = createGenerations(db, { now: () => clock });
    const first = await g.current("platform.flags");
    expect(first).not.toBeNull();
    down = true;
    clock += 5_000;
    expect(await g.current("platform.flags")).toBe(first);
    await Bun.sleep(10); // the failed read, started by the call above, ends
    expect(g.staleMs()).toBe(5_000);
  });

  it("a read that never answers is given up after GENERATIONS_ABANDON_MS: a later caller reads again", async () => {
    let clock = 50_000;
    let hang = false;
    let reads = 0;
    const db = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "transaction")
          return (...a: unknown[]) => {
            reads += 1;
            // A connection that stopped answering: the statement never comes back, and nothing rejects it.
            if (hang) return new Promise(() => {});
            return (v as (...x: unknown[]) => unknown).apply(t, a);
          };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const g = createGenerations(db, { now: () => clock });
    await g.current("platform.flags");
    hang = true;
    clock += 1_100;
    await g.current("platform.flags"); // starts the read that never answers; answers from what is held
    hang = false;
    clock += 3_000; // 3 s into the lost read: one read at a time, so none starts beside it
    await g.current("platform.flags");
    expect(reads).toBe(2);
    clock += 2_100; // 5.1 s: given up. The counters are 6.2 s old, so this caller reads again and waits for it
    await g.current("platform.flags");
    expect(reads).toBe(3);
    expect(g.staleMs()).toBe(0);
  });

  it("a wall clock moved back an hour does not freeze the counters (a monotonic clock by default)", async () => {
    let wall = Date.now();
    const realNow = Date.now;
    Date.now = () => wall;
    try {
      const g = createGenerations(iso.db, { refreshMs: 20 });
      const before = await g.current("test.monotonic");
      await g.bump("test.monotonic", iso.db);
      wall -= 3_600_000;
      await Bun.sleep(30);
      await g.current("test.monotonic"); // past refreshMs on the monotonic clock: the read starts
      await Bun.sleep(30);
      expect(await g.current("test.monotonic")).toBe((before ?? 0) + 1);
      expect(g.staleMs()).toBeLessThan(1_000);
    } finally {
      Date.now = realNow;
    }
  });

  it("a write by this process is seen by its next read, even with an older read still running", async () => {
    let release!: () => void;
    let held = true;
    const db = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "transaction")
          return async (...a: unknown[]) => {
            if (held) await new Promise<void>((r) => (release = r));
            return (v as (...x: unknown[]) => Promise<unknown>).apply(t, a);
          };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    let clock = 0;
    const g = createGenerations(db, { now: () => clock });
    const first = g.current("test.own-write"); // the first read, held back
    await Bun.sleep(5);
    held = false;
    release();
    const was = (await first) ?? 0;
    clock += 2_000;
    held = true;
    await g.current("test.own-write"); // a second read starts and is held back, before the write below
    await g.bump("test.own-write", iso.db); // this process writes: the held read cannot see it
    const after = g.current("test.own-write");
    held = false;
    release();
    expect(await after).toBe(was + 1);
  });

  it("every caller after this process's write sees it, while a read that began before the write runs", async () => {
    let value = 1; // what platform.generations holds
    const held: Array<() => void> = [];
    let hold = false;
    // A fake executor: the SELECT's snapshot is taken when it runs; its answer can be held back after that.
    const fake = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          execute: async () => [],
          select: () => ({
            from: () => {
              const rows = [{ key: "k", value, boot: "1" }];
              return hold ? new Promise((r) => held.push(() => r(rows))) : Promise.resolve(rows);
            },
          }),
        }),
    };
    let clock = 0;
    const g = createGenerations(fake as never, { now: () => clock });
    expect(await g.current("k")).toBe(1);
    clock += 1_100;
    hold = true;
    expect(await g.current("k")).toBe(1); // starts a read whose SELECT sees 1, and answers from memory
    await Bun.sleep(1);
    value = 2; // this process writes (its trigger moves the counter) and says so
    g.invalidate();
    const other = g.current("k"); // the first caller after the write
    await Bun.sleep(1);
    const writer = g.current("k"); // a second one, in the same second
    await Bun.sleep(1);
    hold = false;
    held.shift()!(); // the read from before the write ends, with 1
    expect([await other, await writer]).toEqual([2, 2]);
  });

  it("a lock on the counters holds one connection, and every caller answers from memory meanwhile", async () => {
    const g = createGenerations(iso.db, { refreshMs: 50 });
    const first = await g.current("platform.flags");
    const locker = postgres(iso.url, { max: 1, onnotice: () => {} });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holding = locker.begin(async (tx) => {
      await tx`LOCK TABLE platform.generations IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      const watcher = postgres(iso.url, { max: 1, onnotice: () => {} });
      let waiting = 0;
      const deadline = performance.now() + 2_000;
      while (performance.now() < deadline) {
        const t0 = performance.now();
        expect(await g.current("platform.flags")).toBe(first);
        expect(performance.now() - t0).toBeLessThan(50);
        const [row] = (await watcher.unsafe(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%generations%'`,
        )) as unknown as { n: number }[];
        waiting = Math.max(waiting, row?.n ?? 0);
        await Bun.sleep(60);
      }
      await watcher.end();
      expect(waiting).toBeLessThanOrEqual(1);
      expect(g.staleMs()).toBeGreaterThan(1_000);
    } finally {
      release.resolve();
      await holding;
      await locker.end();
    }
  }, 20_000);

  it("a restart under the counters, or a counter that went back, moves the epoch", async () => {
    let boot = "boot-a";
    const clock = 0;
    const g = createGenerations(iso.db, { now: () => clock, bootTime: () => boot });
    await g.current("test.epoch");
    expect(g.epoch()).toBe(0);
    boot = "boot-b";
    g.invalidate();
    await g.current("test.epoch");
    expect(g.epoch()).toBe(1);
    await g.bump("test.epoch", iso.db);
    await g.current("test.epoch");
    await iso.db.execute(sql`UPDATE platform.generations SET value = value - 1 WHERE key = 'test.epoch'`);
    g.invalidate();
    await g.current("test.epoch");
    expect(g.epoch()).toBe(2);
  });

  it("a key with no row reads 0; a process that never read the counters reads null", async () => {
    const g = createGenerations(iso.db);
    expect(await g.current("no.such.key")).toBe(0);
    const down = createGenerations({ select: () => ({ from: () => Promise.reject(new Error("x")) }) } as never);
    expect(await down.current("platform.flags")).toBeNull();
  });
});

describe("createSnapshot and createGenerationMemo", () => {
  it("a snapshot loads once per generation and serves what it holds while Postgres is away", async () => {
    let clock = 30_000;
    const g = createGenerations(iso.db, { now: () => clock });
    let loads = 0;
    let fail = false;
    const snap = createSnapshot(g, "test.snapshot", async () => {
      loads += 1;
      if (fail) throw new Error("load failed");
      return loads;
    });
    expect(await snap.get()).toBe(1);
    expect(await snap.get()).toBe(1);
    await g.bump("test.snapshot");
    expect(await snap.get()).toBe(2);
    fail = true;
    await g.bump("test.snapshot");
    expect(await snap.get()).toBe(2); // the load failed: the last value stays
    clock += 1;
  });

  it("maxAgeMs reloads what depends on the clock, even without a write", async () => {
    let clock = 40_000;
    const g = createGenerations(iso.db, { now: () => clock });
    let loads = 0;
    const snap = createSnapshot(g, "test.aged", async () => ++loads, { maxAgeMs: 60_000, now: () => clock });
    expect(await snap.get()).toBe(1);
    clock += 59_000;
    expect(await snap.get()).toBe(1);
    clock += 2_000;
    expect(await snap.get()).toBe(1); // past maxAgeMs: served once more while it loads again, never waited for
    await Bun.sleep(20);
    expect(await snap.get()).toBe(2);
  });

  it("a memo empties on a new generation, caps its entries and forgets a failed load", async () => {
    const g = createGenerations(iso.db);
    const memo = createGenerationMemo<string>(g, "test.memo", { maxEntries: 2 });
    let loads = 0;
    const load = (v: string) => async () => {
      loads += 1;
      return v;
    };
    expect(await memo.get("a", load("A"))).toBe("A");
    expect(await memo.get("a", load("A2"))).toBe("A");
    await memo.get("b", load("B"));
    await memo.get("c", load("C"));
    expect(memo.size()).toBe(2);
    await g.bump("test.memo");
    expect(await memo.get("a", load("A3"))).toBe("A3");
    expect(memo.size()).toBe(1);
    await expect(memo.get("bad", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(await memo.get("bad", load("ok"))).toBe("ok");
    expect(loads).toBe(5);
  });

  it("a memo drops what outlived ttlMs with each insert, without waiting for maxEntries", async () => {
    let clock = 0;
    const g = createGenerations(iso.db);
    const memo = createGenerationMemo<string>(g, "test.memo-ttl", { maxEntries: 100, ttlMs: 10, now: () => clock });
    for (const k of ["a", "b", "c"]) await memo.get(k, async () => k);
    expect(memo.size()).toBe(3);
    clock += 20;
    await memo.get("d", async () => "d");
    expect(memo.size()).toBe(1);
  });

  it("a snapshot and a memo load again when the epoch moves, whatever the counter", async () => {
    let boot = "boot-1";
    const clock = 0;
    const g = createGenerations(iso.db, { now: () => clock, bootTime: () => boot });
    let loads = 0;
    const snap = createSnapshot(g, "test.epoch-snap", async () => ++loads);
    const memo = createGenerationMemo<number>(g, "test.epoch-snap", { maxEntries: 10 });
    expect(await snap.get()).toBe(1);
    expect(await memo.get("k", async () => ++loads)).toBe(2);
    boot = "boot-2";
    g.invalidate();
    expect(await snap.get()).toBe(3);
    expect(await memo.get("k", async () => ++loads)).toBe(4);
  });
});
