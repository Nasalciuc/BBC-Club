import { sql } from "drizzle-orm";
import { jobRuns } from "../infrastructure/schema";

export type JobContext = {
  db: any;
  logger: {
    info: (o: object, m?: string) => void;
    warn: (o: object, m?: string) => void;
    error: (o: object, m?: string) => void;
  };
  signal: AbortSignal;
};
export type JobHandler = (ctx: JobContext) => Promise<Record<string, number> | void>;
export type JobSpec = {
  handler: JobHandler;
  /** Only one run at a time across all API instances (advisory lock on the job name). */
  singleton?: boolean;
  timeoutMs?: number;
  description?: string;
};

/** Jobs are plain functions registered in code and triggered over HTTP by the cron container
 *  (`POST /v1/internal/run/:name`, authorized `jobs:run`). Every run is recorded in platform.job_runs —
 *  that table is the only honest answer to "did the backup run last night?". */
export function createJobs(
  db: any,
  deps: {
    logger: JobContext["logger"];
    metrics?: {
      inc(n: string, l?: Record<string, string>): void;
      observe(n: string, v: number, l?: Record<string, string>): void;
    };
  },
) {
  const registry = new Map<string, JobSpec>();

  async function run(name: string): Promise<{
    status: "succeeded" | "failed" | "skipped";
    durationMs: number;
    metrics?: Record<string, number>;
    error?: string;
  }> {
    const spec = registry.get(name);
    if (!spec) throw new Error(`unknown job: ${name}`);
    const started = Date.now();

    // singleton: a second concurrent run is a no-op, not an error (cron overlap is normal)
    if (spec.singleton) {
      const rows: any[] = await db.execute(sql`SELECT pg_try_advisory_lock(hashtext(${"job:" + name})) AS ok`);
      if (!rows[0]?.ok) {
        deps.logger.warn({ job: name }, "job already running, skipped");
        await db.insert(jobRuns).values({ job: name, status: "skipped", finishedAt: sql`now()`, durationMs: 0 });
        return { status: "skipped", durationMs: 0 };
      }
    }

    const [runRow] = await db.insert(jobRuns).values({ job: name, status: "running" }).returning({ id: jobRuns.id });
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), spec.timeoutMs ?? 10 * 60_000);

    try {
      const metrics = (await spec.handler({ db, logger: deps.logger, signal: ac.signal })) ?? undefined;
      const durationMs = Date.now() - started;
      await db
        .update(jobRuns)
        .set({ status: "succeeded", finishedAt: sql`now()`, durationMs, metrics })
        .where(sql`${jobRuns.id} = ${runRow.id}`);
      deps.metrics?.observe("job_duration_ms", durationMs, { job: name });
      deps.metrics?.inc("job_succeeded", { job: name });
      deps.logger.info({ job: name, durationMs, ...(metrics ?? {}) }, "job succeeded");
      return { status: "succeeded", durationMs, metrics };
    } catch (e: any) {
      const durationMs = Date.now() - started;
      const error = String(e?.message ?? e).slice(0, 2000);
      await db
        .update(jobRuns)
        .set({ status: "failed", finishedAt: sql`now()`, durationMs, error })
        .where(sql`${jobRuns.id} = ${runRow.id}`);
      deps.metrics?.inc("job_failed", { job: name });
      deps.logger.error({ job: name, durationMs, err: error }, "job failed");
      return { status: "failed", durationMs, error };
    } finally {
      clearTimeout(timeout);
      if (spec.singleton) await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${"job:" + name}))`);
    }
  }

  return {
    register(name: string, spec: JobSpec) {
      if (registry.has(name)) throw new Error(`job already registered: ${name}`);
      registry.set(name, spec);
    },
    has: (name: string) => registry.has(name),
    names: () => [...registry.keys()],
    run,
    /** Last run per job — for /ready, dashboards and the "is anything stale?" alert. */
    async lastRuns(): Promise<Record<string, { status: string; at: Date | null; durationMs: number | null }>> {
      const rows: any[] = await db.execute(sql`
        SELECT DISTINCT ON (job) job, status, started_at, duration_ms
        FROM platform.job_runs ORDER BY job, started_at DESC`);
      return Object.fromEntries(
        rows.map((r) => [r.job, { status: r.status, at: r.started_at, durationMs: r.duration_ms }]),
      );
    },
  };
}
export type Jobs = ReturnType<typeof createJobs>;
