import { sql } from "drizzle-orm";
import { CRON_FIELDS_RE, type JobSpec } from "@bbc/shared/platform-specs";
import { jobRuns } from "../infrastructure/schema";
import type { Db } from "@bbc/db";

export type JobContext = {
  db: Db;
  logger: {
    info: (o: object, m?: string) => void;
    warn: (o: object, m?: string) => void;
    error: (o: object, m?: string) => void;
  };
  signal: AbortSignal;
};
export type JobHandler = (ctx: JobContext) => Promise<Record<string, number> | void>;
export type { JobSpec };

/** Jobs are plain functions registered in code and triggered over HTTP by the cron container
 *  (`POST /v1/internal/run/:name`, authorized `jobs:run`). Every run is recorded in platform.job_runs —
 *  that table is the only honest answer to "did the backup run last night?". */
export function createJobs(
  db: Db,
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

    // singleton: hold the lock on ONE reserved connection for the whole run. A session advisory lock taken
    // through the pool can be "unlocked" on a different connection, which silently does nothing.
    let reserved: any = null;
    if (spec.singleton) {
      reserved = await db.raw.reserve();
      const [{ ok }] = await reserved`SELECT pg_try_advisory_lock(hashtext(${"job:" + name})) AS ok`;
      if (!ok) {
        reserved.release();
        reserved = null;
        deps.logger.warn({ job: name }, "job already running, skipped");
        await db.insert(jobRuns).values({ job: name, status: "skipped", finishedAt: sql`now()`, durationMs: 0 });
        return { status: "skipped", durationMs: 0 };
      }
    }

    // From here on the lock is held: everything, the job_runs insert included, runs inside try so that finally
    // always unlocks and releases the reserved connection. A throw outside it would keep the lock on a leaked
    // connection, and every later run would be "skipped" until the process restarts.
    let runId: bigint | null = null;
    const ac = new AbortController();
    const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;
    const timeout = setTimeout(() => ac.abort(), spec.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);

    try {
      const [runRow] = await db.insert(jobRuns).values({ job: name, status: "running" }).returning({ id: jobRuns.id });
      if (!runRow) throw new Error(`job ${name}: the job_runs insert returned no row`);
      runId = runRow.id;
      const raw = await spec.handler({ db, logger: deps.logger, signal: ac.signal });
      const metrics =
        raw !== null &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        Object.values(raw).every((v) => typeof v === "number" && Number.isFinite(v))
          ? (raw as Record<string, number>)
          : undefined;
      const durationMs = Date.now() - started;
      await db
        .update(jobRuns)
        .set({ status: "succeeded", finishedAt: sql`now()`, durationMs, metrics })
        .where(sql`${jobRuns.id} = ${runId}`);
      deps.metrics?.observe("job_duration_ms", durationMs, { job: name });
      deps.metrics?.inc("job_succeeded", { job: name });
      deps.logger.info({ job: name, durationMs, ...(metrics ?? {}) }, "job succeeded");
      return { status: "succeeded", durationMs, metrics };
    } catch (e: any) {
      const durationMs = Date.now() - started;
      const error = String(e?.message ?? e).slice(0, 2000);
      // No row when the insert itself failed; the result and the log still say so.
      if (runId !== null)
        await db
          .update(jobRuns)
          .set({ status: "failed", finishedAt: sql`now()`, durationMs, error })
          .where(sql`${jobRuns.id} = ${runId}`);
      deps.metrics?.inc("job_failed", { job: name });
      deps.logger.error({ job: name, durationMs, err: error }, "job failed");
      return { status: "failed", durationMs, error };
    } finally {
      clearTimeout(timeout);
      if (reserved) {
        try {
          await reserved`SELECT pg_advisory_unlock(hashtext(${"job:" + name}))`;
        } finally {
          reserved.release();
        }
      }
    }
  }

  return {
    register(name: string, spec: JobSpec) {
      if (registry.has(name)) throw new Error(`job already registered: ${name}`);
      if (!/^[a-z][a-z0-9-]*$/.test(name))
        throw new Error(`job ${name}: kebab-case only (crontab column + URL segment)`);
      if (spec.cron !== "manual" && !CRON_FIELDS_RE.test(spec.cron.trim()))
        throw new Error(`job ${name}: invalid cron "${spec.cron}" — five fields or "manual"`);
      registry.set(name, spec);
    },
    has: (name: string) => registry.has(name),
    names: () => [...registry.keys()],
    /** Every scheduled job, sorted — the only input of cron:gen and of the parity test. */
    schedule: (): Array<{ name: string; cron: string }> =>
      [...registry.entries()]
        .filter(([, s]) => s.cron !== "manual")
        .map(([name, s]) => ({ name, cron: s.cron.trim().replace(/\s+/g, " ") }))
        .sort((a, b) => a.name.localeCompare(b.name)),
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
