import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-jobs-singleton", { max: 10 });
  db = iso.db;
});
afterAll(() => iso.drop());

describe("singleton jobs on a connection pool", () => {
  it("runs on every consecutive call, not just the first", async () => {
    const p = createPlatform(db, { level: "silent" });
    let runs = 0;
    p.jobs.register("single-seq", {
      cron: "manual",
      singleton: true,
      handler: async () => {
        runs++;
      },
    });
    for (let i = 0; i < 12; i++) expect((await p.jobs.run("single-seq")).status).toBe("succeeded");
    expect(runs).toBe(12); // with the pooled bug this is 1 and eleven "skipped"
  });

  it("still refuses a truly concurrent second run", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.jobs.register("single-par", {
      cron: "manual",
      singleton: true,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 300));
      },
    });
    const [a, b] = await Promise.all([p.jobs.run("single-par"), p.jobs.run("single-par")]);
    expect([a.status, b.status].sort()).toEqual(["skipped", "succeeded"]);
  });

  it("a failed job_runs insert still frees the lock: the next run goes ahead", async () => {
    const p = createPlatform(db, { level: "silent" });
    let runs = 0;
    p.jobs.register("single-leak", {
      cron: "manual",
      singleton: true,
      handler: async () => {
        runs++;
      },
    });
    // Failure injection: the database refuses this job's "running" row — after the lock is taken.
    await db.execute(
      sql`ALTER TABLE platform.job_runs ADD CONSTRAINT inject_single_leak CHECK (job <> 'single-leak') NOT VALID`,
    );
    const first = await p.jobs.run("single-leak").then(
      (r) => r.status,
      () => "threw",
    );
    await db.execute(sql`ALTER TABLE platform.job_runs DROP CONSTRAINT inject_single_leak`);
    const [locks] = (await db.execute(sql`SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)) as unknown as {
      n: number;
    }[];
    const next = await p.jobs.run("single-leak");
    // With the insert outside try: first "threw", the lock stays held (1) and every later run is "skipped".
    expect({ first, advisoryLocks: locks?.n, next: next.status, runs }).toEqual({
      first: "failed",
      advisoryLocks: 0,
      next: "succeeded",
      runs: 1,
    });
  });

  it("persists metrics only when every value is a finite number", async () => {
    const p = createPlatform(db, { level: "silent" });
    p.jobs.register("metrics-array", {
      cron: "manual",
      handler: async () => ["x"],
    });
    await p.jobs.run("metrics-array");
    const [bad]: { metrics: unknown }[] = await db.execute(
      sql`SELECT metrics FROM platform.job_runs WHERE job = ${"metrics-array"} ORDER BY started_at DESC LIMIT 1`,
    );
    expect(bad.metrics).toBeNull();

    p.jobs.register("metrics-ok", {
      cron: "manual",
      handler: async () => ({ n: 3 }),
    });
    const r = await p.jobs.run("metrics-ok");
    expect(r.metrics).toEqual({ n: 3 });
    const [ok]: { metrics: unknown }[] = await db.execute(
      sql`SELECT metrics FROM platform.job_runs WHERE job = ${"metrics-ok"} ORDER BY started_at DESC LIMIT 1`,
    );
    expect(ok.metrics).toEqual({ n: 3 });
  });
});
