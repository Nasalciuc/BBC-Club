/** ADR-IMPL-077: retention in batches — what ages out goes, each job's last run stays, a second run deletes nothing. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { deleteInBatches } from "@bbc/db/helpers";
import { createPlatform, lastFinishedRunsSql, registerPlatformJobs } from "../src/api";
import { jobRuns, kafkaProcessed } from "../src/infrastructure/schema";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-retention", { max: 3 });
});
afterAll(() => iso.drop());

const runsOf = async (job: string) =>
  (
    (await iso.db.execute(
      sql`SELECT (now() - started_at > interval '30 days') AS old FROM platform.job_runs WHERE job = ${job} ORDER BY started_at`,
    )) as unknown as { old: boolean }[]
  ).map((r) => r.old);

describe("retention", () => {
  it("keeps 30 days of job runs and each job's last run, however old; a second run deletes nothing", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.job_runs (job, status, started_at) VALUES
        ('r.busy', 'succeeded', now() - interval '90 days'),
        ('r.busy', 'succeeded', now() - interval '60 days'),
        ('r.busy', 'failed', now() - interval '31 days'),
        ('r.busy', 'succeeded', now() - interval '1 day'),
        ('r.gone', 'succeeded', now() - interval '200 days'),
        ('r.gone', 'succeeded', now() - interval '100 days')`);
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at) VALUES
        ('r.c', 'old', now() - interval '15 days'), ('r.c', 'new', now() - interval '13 days')`);
    const p = createPlatform(iso.db, { level: "silent" });
    registerPlatformJobs(p.jobs, p.metrics);
    const first = await p.jobs.run("retention");
    expect(first.error ?? first.status).toBe("succeeded");
    expect(first.metrics?.jobRunsDeleted).toBe(4);
    expect(first.metrics?.kafkaProcessedDeleted).toBe(1);
    expect(await runsOf("r.busy")).toEqual([false]);
    expect(await runsOf("r.gone")).toEqual([true]); // its last run, kept for /status
    const second = await p.jobs.run("retention");
    expect(second.metrics?.jobRunsDeleted).toBe(0);
    expect(second.metrics?.kafkaProcessedDeleted).toBe(0);
  });

  it("keeps each job's last finished run however old: a failure followed only by skipped runs stays", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.job_runs (job, status, started_at) VALUES
        ('r.failing', 'failed', now() - interval '40 days'),
        ('r.failing', 'skipped', now() - interval '35 days'),
        ('r.failing', 'skipped', now() - interval '1 day'),
        ('r.fixed', 'failed', now() - interval '40 days'),
        ('r.fixed', 'succeeded', now() - interval '35 days'),
        ('r.fixed', 'skipped', now() - interval '1 day')`);
    const statuses = async (job: string) =>
      (
        (await iso.db.execute(
          sql`SELECT status FROM platform.job_runs WHERE job = ${job} ORDER BY started_at`,
        )) as unknown as { status: string }[]
      ).map((r) => r.status);
    const p = createPlatform(iso.db, { level: "silent" });
    registerPlatformJobs(p.jobs, p.metrics);
    const run = await p.jobs.run("retention");
    expect(run.error ?? run.status).toBe("succeeded");
    expect(await statuses("r.failing")).toEqual(["failed", "skipped"]);
    expect(await statuses("r.fixed")).toEqual(["succeeded", "skipped"]);
    // /status still reads the old failure as the job's last finished run.
    const [last] = (await iso.db.execute(lastFinishedRunsSql(["r.failing"]))) as unknown as { status: string }[];
    expect(last?.status).toBe("failed");
  });

  it("deleteInBatches deletes batch by batch until one comes back short", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at)
      SELECT 'b.c', 'e' || g, now() - interval '30 days' FROM generate_series(1, 7) g`);
    const statements: string[] = [];
    const spy = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "execute")
          return (q: unknown) => {
            statements.push("delete");
            return (v as (x: unknown) => unknown).call(t, q);
          };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const n = await deleteInBatches(spy, kafkaProcessed, sql`${kafkaProcessed.consumer} = 'b.c'`, { batch: 3 });
    expect(n).toBe(7);
    expect(statements.length).toBe(3); // 3 + 3 + 1
    expect(await deleteInBatches(iso.db, jobRuns, sql`false`)).toBe(0);
  });

  it("deleteInBatches stops before the next batch once the job's signal is aborted; what it deleted stays deleted", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at)
      SELECT 's.c', 'e' || g, now() - interval '30 days' FROM generate_series(1, 7) g`);
    const ac = new AbortController();
    let statements = 0;
    // Each statement counted; the job's timeout comes as the first batch returns.
    const spy = new Proxy(iso.db, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "execute")
          return async (q: unknown) => {
            statements++;
            const r = await (v as (x: unknown) => Promise<unknown>).call(t, q);
            ac.abort();
            return r;
          };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const where = sql`${kafkaProcessed.consumer} = 's.c'`;
    const left = async () =>
      (
        (await iso.db.execute(
          sql`SELECT count(*)::int AS n FROM platform.kafka_processed WHERE consumer = 's.c'`,
        )) as unknown as { n: number }[]
      )[0]!.n;

    await expect(
      deleteInBatches(spy, kafkaProcessed, where, { batch: 3, signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(statements).toBe(0);
    expect(await left()).toBe(7);

    await expect(deleteInBatches(spy, kafkaProcessed, where, { batch: 3, signal: ac.signal })).rejects.toThrow();
    expect(statements).toBe(1);
    expect(await left()).toBe(4);
  });
});
