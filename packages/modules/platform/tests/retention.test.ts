/** ADR-IMPL-077: retention in batches — what ages out goes, each job's last run stays, a second run deletes nothing. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { deleteInBatches } from "@bbc/db/helpers";
import { createPlatform, registerPlatformJobs } from "../src/api";
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
});
