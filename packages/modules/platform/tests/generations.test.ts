/** ADR-IMPL-075: reference-table counters, the snapshots and memos built on them, and the triggers that bump them. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
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
    const db = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "select")
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
    await g.current("platform.flags");
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
        if (k === "select" && down) return () => ({ from: () => Promise.reject(new Error("db down")) });
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
    expect(g.staleMs()).toBe(5_000);
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
});
