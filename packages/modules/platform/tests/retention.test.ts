/** ADR-IMPL-077: retention in batches — what ages out goes, each job's last run stays, a second run deletes nothing. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { integer, pgTable } from "drizzle-orm/pg-core";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { deleteInBatches, retainEach } from "@bbc/db/helpers";
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
    // Every table the job deletes from: what aged out, and beside it what did not.
    await iso.db.execute(sql`
      WITH e AS (
        INSERT INTO platform.domain_events (type, aggregate_type, aggregate_id, payload, published_by)
        VALUES ('r.probe', 'probe', 'r', '{}', 'test') RETURNING id, occurred_at)
      INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id, status, processed_at)
      SELECT id, occurred_at, c, 'r', s::platform.delivery_status, at FROM e, (VALUES
        ('r.done-old', 'done', now() - interval '31 days'), ('r.done-new', 'done', now() - interval '29 days'),
        ('r.dead-old', 'dead', now() - interval '31 days')) v(c, s, at)`);
    await iso.db.execute(sql`
      INSERT INTO platform.rate_limits (key, window_start, expires_at) VALUES
        ('r.rl-old', now() - interval '2 hours', now() - interval '1 hour'), ('r.rl-new', now(), now() + interval '1 hour')`);
    await iso.db.execute(sql`
      INSERT INTO platform.rate_limit_state (key, tat) VALUES
        ('r.st-old', now() - interval '25 hours'), ('r.st-new', now() - interval '23 hours')`);
    await iso.db.execute(sql`
      INSERT INTO platform.event_dlq (delivery_id, event_id, consumer, attempts, last_error, failed_at) VALUES
        (-1, -1, 'r.dlq-old', 5, 'x', now() - interval '91 days'), (-2, -1, 'r.dlq-new', 5, 'x', now() - interval '89 days')`);
    const p = createPlatform(iso.db, { level: "silent" });
    registerPlatformJobs(p.jobs, p.metrics);
    const first = await p.jobs.run("retention");
    expect(first.error ?? first.status).toBe("succeeded");
    expect(first.metrics?.jobRunsDeleted).toBe(4);
    expect(first.metrics?.kafkaProcessedDeleted).toBe(1);
    const left = async (q: ReturnType<typeof sql>) =>
      ((await iso.db.execute(q)) as unknown as { k: string }[]).map((r) => r.k).sort();
    expect(await left(sql`SELECT consumer k FROM platform.event_deliveries WHERE consumer LIKE 'r.%'`)).toEqual([
      "r.dead-old", // a dead one waits for its operator
      "r.done-new",
    ]);
    expect(await left(sql`SELECT key k FROM platform.rate_limits WHERE key LIKE 'r.%'`)).toEqual(["r.rl-new"]);
    expect(await left(sql`SELECT key k FROM platform.rate_limit_state WHERE key LIKE 'r.%'`)).toEqual(["r.st-new"]);
    expect(await left(sql`SELECT consumer k FROM platform.event_dlq WHERE consumer LIKE 'r.%'`)).toEqual(["r.dlq-new"]);
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
    expect(n).toEqual({ deleted: 7, capped: false });
    expect(statements.length).toBe(3); // 3 + 3 + 1
    expect(await deleteInBatches(iso.db, jobRuns, sql`false`)).toEqual({ deleted: 0, capped: false });
  });

  it("deleteInBatches says when it stopped at its bound: the next run carries on (R2)", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at)
      SELECT 'cap.c', 'e' || g, now() - interval '30 days' FROM generate_series(1, 7) g`);
    const where = sql`${kafkaProcessed.consumer} = 'cap.c'`;
    expect(await deleteInBatches(iso.db, kafkaProcessed, where, { batch: 3, maxBatches: 2 })).toEqual({
      deleted: 6,
      capped: true,
    });
    expect(await deleteInBatches(iso.db, kafkaProcessed, where, { batch: 3, maxBatches: 2 })).toEqual({
      deleted: 1,
      capped: false,
    });
  });

  it("deleteInBatches on a partitioned table deletes exactly the rows named, never their ctid twins (R3)", async () => {
    await iso.db.execute(sql`CREATE TABLE public.r3_part (id int NOT NULL) PARTITION BY RANGE (id)`);
    await iso.db.execute(sql`CREATE TABLE public.r3_part_a PARTITION OF public.r3_part FOR VALUES FROM (0) TO (1000)`);
    await iso.db.execute(
      sql`CREATE TABLE public.r3_part_b PARTITION OF public.r3_part FOR VALUES FROM (1000) TO (2000)`,
    );
    // Three rows in each partition: the same ctids, (0,1) to (0,3), in both.
    await iso.db.execute(sql`INSERT INTO public.r3_part SELECT g FROM generate_series(0, 2) g`);
    await iso.db.execute(sql`INSERT INTO public.r3_part SELECT g FROM generate_series(1000, 1002) g`);
    const part = pgTable("r3_part", { id: integer("id").notNull() });
    expect(await deleteInBatches(iso.db, part, sql`${part.id} < 1000`)).toEqual({ deleted: 3, capped: false });
    const left = (await iso.db.execute(sql`SELECT id FROM public.r3_part ORDER BY id`)) as unknown as { id: number }[];
    expect(left.map((r) => r.id)).toEqual([1000, 1001, 1002]);
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
    ).rejects.toMatchObject({ name: "DeleteStopped", deleted: 0 });
    expect(statements).toBe(0);
    expect(await left()).toBe(7);

    await expect(deleteInBatches(spy, kafkaProcessed, where, { batch: 3, signal: ac.signal })).rejects.toMatchObject({
      name: "DeleteStopped",
      deleted: 3,
    });
    expect(statements).toBe(1);
    expect(await left()).toBe(4);
  });

  it("R1: past a small timeout the table being deleted stops, the ones after are skipped, the run fails with its counts", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at)
      SELECT 'r1.' || c, 'e' || g, now() - interval '30 days' FROM generate_series(1, 2) g, unnest(ARRAY['a', 'b', 'c']) c`);
    const p = createPlatform(iso.db, { level: "silent" });
    const of = (c: string) => sql`${kafkaProcessed.consumer} = ${"r1." + c}`;
    p.jobs.register("retention-probe", {
      cron: "manual",
      timeoutMs: 300,
      handler: ({ db, signal }) =>
        retainEach(signal, {
          first: () => deleteInBatches(db, kafkaProcessed, of("a"), { signal }),
          // Slower than the job's time: its first batch waits past the timeout, so it stops before deleting.
          slow: async () => {
            await db.execute(sql`SELECT pg_sleep(0.6)`);
            return deleteInBatches(db, kafkaProcessed, of("b"), { signal });
          },
          third: () => deleteInBatches(db, kafkaProcessed, of("c"), { signal }),
          fourth: () => deleteInBatches(db, kafkaProcessed, sql`false`, { signal }),
        }),
    });
    const run = await p.jobs.run("retention-probe");
    expect(run.status).toBe("failed");
    expect(run.metrics).toEqual({ firstDeleted: 2, slowDeleted: 0, slowStopped: 1, thirdSkipped: 1, fourthSkipped: 1 });
    expect(run.error).toContain("stopped: slow; skipped, the job's time up: third, fourth");
    const [row] = (await iso.db.execute(
      sql`SELECT status, metrics FROM platform.job_runs WHERE job = 'retention-probe'`,
    )) as unknown as { status: string; metrics: Record<string, number> | null }[];
    expect(row).toEqual({ status: "failed", metrics: run.metrics! });
  });

  it("R1: a table that fails leaves the next ones to run; the error says which, never the query's values", async () => {
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at)
      SELECT 'r1f.' || c, 'e' || g, now() - interval '30 days' FROM generate_series(1, 2) g, unnest(ARRAY['a', 'c']) c`);
    const p = createPlatform(iso.db, { level: "silent" });
    const of = (c: string) => sql`${kafkaProcessed.consumer} = ${"r1f." + c}`;
    p.jobs.register("retention-failing", {
      cron: "manual",
      handler: ({ db, signal }) =>
        retainEach(signal, {
          first: () => deleteInBatches(db, kafkaProcessed, of("a"), { signal }),
          broken: () =>
            deleteInBatches(db, kafkaProcessed, sql`${kafkaProcessed.consumer} = ${"secret-value"}::int > 0`, {
              signal,
            }),
          third: () => deleteInBatches(db, kafkaProcessed, of("c"), { signal }),
        }),
    });
    const run = await p.jobs.run("retention-failing");
    expect(run.status).toBe("failed");
    expect(run.metrics).toEqual({ firstDeleted: 2, brokenDeleted: 0, brokenStopped: 1, thirdDeleted: 2 });
    expect(run.error).toContain("stopped: broken");
    expect(run.error).not.toContain("secret-value");
  });

  it("X8: a journal held past 3 s keeps its old partition for tomorrow; the rest of the retention runs", async () => {
    await iso.db.execute(sql`
      CREATE TABLE platform.domain_events_2020_01 PARTITION OF platform.domain_events
        FOR VALUES FROM ('2020-01-01') TO ('2020-02-01')`);
    await iso.db.execute(sql`
      INSERT INTO platform.kafka_processed (consumer, event_id, processed_at) VALUES ('x8.c', 'old', now() - interval '15 days')`);
    const partitions = async () =>
      (
        (await iso.db.execute(
          sql`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'domain_events_2020_01'`,
        )) as unknown as { n: number }[]
      )[0]!.n;
    const p = createPlatform(iso.db, { level: "silent" });
    registerPlatformJobs(p.jobs, p.metrics);

    // Another connection reads the journal and keeps its transaction open, as a long report would.
    const reader = postgres(iso.url, { max: 1, onnotice: () => {} });
    const reading = Promise.withResolvers<void>();
    const done = Promise.withResolvers<void>();
    const held = reader.begin(async (tx) => {
      await tx`SELECT id FROM platform.domain_events LIMIT 1`;
      reading.resolve();
      await done.promise;
    });
    try {
      await reading.promise;
      const t = performance.now();
      const run = await p.jobs.run("retention");
      expect(performance.now() - t).toBeLessThan(5_000);
      expect(run.error ?? run.status).toBe("succeeded");
      expect(run.metrics?.partitionsDropped).toBe(0);
      expect(run.metrics?.partitionsDeferred).toBe(1);
      expect(run.metrics?.kafkaProcessedDeleted).toBeGreaterThanOrEqual(1);
      expect(await iso.db.execute(sql`SELECT 1 FROM platform.kafka_processed WHERE consumer = 'x8.c'`)).toHaveLength(0);
      expect(await partitions()).toBe(1);
    } finally {
      done.resolve();
      await held;
      await reader.end();
    }

    // Tomorrow, nothing holds the journal: the partition goes.
    const next = await p.jobs.run("retention");
    expect(next.metrics?.partitionsDropped).toBe(1);
    expect(next.metrics?.partitionsDeferred).toBe(0);
    expect(await partitions()).toBe(0);
  }, 20_000);
});
