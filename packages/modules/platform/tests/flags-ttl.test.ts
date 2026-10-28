/** ADR-IMPL-075: flags from one snapshot per process, current within a second of any write, kill flags fail-closed. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createFlags, KILL_STALE_MS } from "../src/flags";
import { createGenerations } from "../src/generations";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-flags-snapshot", { max: 2 });
});
afterAll(() => iso.drop());

/** Counts the reads the flags send: the counters' (one short transaction) and the table's (a `select`). */
function counted(db: IsolatedDb["db"]) {
  const seen: number[] = [];
  const spy = new Proxy(db, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (k === "select" || k === "transaction")
        return (...a: unknown[]) => {
          seen.push(seen.length);
          return (v as (...x: unknown[]) => unknown).apply(t, a);
        };
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { db: spy, seen };
}

describe("flags snapshot", () => {
  it("a hundred reads in a second cost the counters' read and one read of the table", async () => {
    let clock = 1_000_000;
    const { db, seen } = counted(iso.db);
    const flags = createFlags(db, { now: () => clock });
    await iso.db.execute(
      sql`INSERT INTO platform.flags (key, value) VALUES ('catalog.search_events', '{"enabled":true}')`,
    );
    for (let i = 0; i < 100; i++) expect(await flags.isEnabled("catalog.search_events")).toBe(true);
    expect(await flags.isKilled("catalog")).toBe(false);
    expect(seen.length).toBe(2);
    clock += 1_001; // a second on: the counters are asked again, the table only if they moved
    expect(await flags.isEnabled("catalog.search_events")).toBe(true);
    expect(seen.length).toBe(3);
  });

  it("a write from psql reaches the snapshot within a second, through the table's trigger", async () => {
    let clock = 2_000_000;
    const flags = createFlags(iso.db, { now: () => clock });
    expect(await flags.isKilled("engagement")).toBe(false);
    await iso.db.execute(
      sql`INSERT INTO platform.flags (key, value) VALUES ('engagement.killed', '{"enabled":true}')
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    );
    expect(await flags.isKilled("engagement")).toBe(false); // the same second: what the process held
    clock += 1_001;
    await flags.isKilled("engagement"); // a second on: this call starts the counters' read and answers from memory
    await Bun.sleep(20);
    expect(await flags.isKilled("engagement")).toBe(true);
    await iso.db.execute(sql`DELETE FROM platform.flags WHERE key = 'engagement.killed'`);
    clock += 1_001;
    await flags.isKilled("engagement");
    await Bun.sleep(20);
    expect(await flags.isKilled("engagement")).toBe(false);
  });

  it("set() is read back at once by the process that wrote it", async () => {
    const flags = createFlags(iso.db);
    await flags.set("personalization.ranker", { variant: "rules" });
    expect(await flags.variant("personalization.ranker", "none")).toBe("rules");
    await flags.set("personalization.ranker", { variant: "model" });
    expect(await flags.variant("personalization.ranker", "none")).toBe("model");
  });

  it("counters unread for more than KILL_STALE_MS: kill and pause fail closed, ordinary flags keep the last value", async () => {
    let clock = 3_000_000;
    let down = false;
    const db = new Proxy(iso.db, {
      get(t, k) {
        if (k === "select" && down) return () => ({ from: () => Promise.reject(new Error("db down")) });
        if (k === "transaction" && down) return () => Promise.reject(new Error("db down"));
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const generations = createGenerations(db, { now: () => clock });
    const flags = createFlags(db, { generations, now: () => clock });
    await iso.db.execute(
      sql`INSERT INTO platform.flags (key, value) VALUES ('app.recommended_version', '{"variant":"1.2.0"}')
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    );
    expect(await flags.variant("app.recommended_version", "0.1.0")).toBe("1.2.0");
    expect(await flags.isKilled("requests")).toBe(false);
    down = true;
    clock += KILL_STALE_MS - 1_000;
    expect(await flags.isKilled("requests")).toBe(false); // nine seconds: still trusted
    clock += 2_000;
    expect(await flags.isKilled("requests")).toBe(true);
    expect(await flags.consumerPauseState("x.onY")).toBe("unknown");
    expect(await flags.variant("app.recommended_version", "0.1.0")).toBe("1.2.0");
    expect(await flags.killState("requests")).toBe(false); // boot's read: what the snapshot holds, no stale verdict
    down = false;
    clock += 1_001;
    expect(await flags.isKilled("requests")).toBe(false);
  });

  it("a process that never read the table: ordinary flags take the default, kill fails closed, killState throws", async () => {
    const db = { select: () => ({ from: () => Promise.reject(new Error("db down")) }) };
    const flags = createFlags(db as never);
    expect(await flags.isEnabled("x", true)).toBe(true);
    expect(await flags.isKilled("engagement")).toBe(true);
    await expect(flags.killState("engagement")).rejects.toThrow("db down");
    await expect(flags.readStrict("x")).rejects.toThrow("db down");
  });
});
