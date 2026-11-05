import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "../src/api";
import { createJobs } from "../src/jobs";

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

describe("singleton jobs never wedge the pool (5 Nov 2026)", () => {
  // Production at 02:00 UTC, staging at 04:00: more singleton jobs fired in one second than the pool has connections.
  // Each reserved one for its lock and then waited for another to write its "running" row: every job stopped until
  // the worker was restarted, eight hours later.
  it("ten singleton jobs at once on a pool of ten all finish", async () => {
    const p = createPlatform(db, { level: "silent" });
    const names = Array.from({ length: 10 }, (_, i) => `burst-${i}`);
    for (const name of names)
      p.jobs.register(name, {
        cron: "manual",
        singleton: true,
        handler: async (ctx) => {
          await new Promise((r) => setTimeout(r, 50));
          await ctx.db.execute(sql`SELECT 1`);
        },
      });
    const wedged = new Promise<"wedged">((r) => setTimeout(() => r("wedged"), 20_000));
    const outcome = await Promise.race([Promise.all(names.map((n) => p.jobs.run(n))), wedged]);
    expect(outcome === "wedged" ? outcome : outcome.map((r) => r.status)).toEqual(names.map(() => "succeeded"));
  }, 30_000);

  it("a run that finds no free slot in time is recorded as skipped, not left waiting", async () => {
    const quiet = { info: () => {}, warn: () => {}, error: () => {} };
    const jobs = createJobs(db, { logger: quiet, slots: 1, slotWaitMs: 200 });
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    jobs.register("slot-holder", { cron: "manual", singleton: true, handler: () => held });
    jobs.register("slot-waiter", { cron: "manual", singleton: true, handler: async () => {} });
    const holder = jobs.run("slot-holder");
    await new Promise((r) => setTimeout(r, 50));
    const waiter = await jobs.run("slot-waiter");
    release();
    expect({ waiter: waiter.status, holder: (await holder).status }).toEqual({
      waiter: "skipped",
      holder: "succeeded",
    });
    expect((await jobs.run("slot-waiter")).status).toBe("succeeded");
  });

  it("a handler that outlives its timeout and its grace ends the run, and frees its lock and slot", async () => {
    const quiet = { info: () => {}, warn: () => {}, error: () => {} };
    const jobs = createJobs(db, { logger: quiet, slots: 1, graceMs: 100 });
    let calls = 0;
    jobs.register("stuck", {
      cron: "manual",
      singleton: true,
      timeoutMs: 100,
      handler: async () => {
        calls++;
        if (calls === 1) await new Promise(() => {}); // never settles, the signal ignored
      },
    });
    const started = Date.now();
    const first = await jobs.run("stuck");
    expect({ status: first.status, error: first.error, fast: Date.now() - started < 5_000 }).toEqual({
      status: "failed",
      error: "JobTimedOut: job stuck: still running 100 ms after its 100 ms timeout",
      fast: true,
    });
    expect((await jobs.run("stuck")).status).toBe("succeeded");
  });

  it("a handler that stops within its grace keeps its own outcome", async () => {
    const quiet = { info: () => {}, warn: () => {}, error: () => {} };
    const jobs = createJobs(db, { logger: quiet, graceMs: 2_000 });
    jobs.register("winds-down", {
      cron: "manual",
      timeoutMs: 100,
      handler: async ({ signal }) => {
        await new Promise((r) => signal.addEventListener("abort", r));
        await new Promise((r) => setTimeout(r, 100));
        return { stoppedEarly: 1 };
      },
    });
    const r = await jobs.run("winds-down");
    expect({ status: r.status, metrics: r.metrics }).toEqual({ status: "succeeded", metrics: { stoppedEarly: 1 } });
  });
});
