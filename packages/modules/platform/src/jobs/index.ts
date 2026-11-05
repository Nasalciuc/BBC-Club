import { sql } from "drizzle-orm";
import { inConst } from "@bbc/db/helpers";
import { CRON_FIELDS_RE, type JobSpec } from "@bbc/shared/platform-specs";
import { jobRuns } from "../infrastructure/schema";
import { errorForLog, errorLine, type Db } from "@bbc/db";

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

/** The jobs asked about, bound as one array: one statement whatever the number of jobs a process registers. */
const jobList = (names: readonly string[]) => sql`unnest(${sql.param(names)}::text[]) AS j(job_name)`;

/** A job's counts, kept in job_runs.metrics: an object of finite numbers, or nothing. */
function numbersOnly(raw: unknown): Record<string, number> | undefined {
  return raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.values(raw).every((v) => typeof v === "number" && Number.isFinite(v))
    ? (raw as Record<string, number>)
    : undefined;
}

/** Each job's last run: one probe per job on `job_runs_job_started`, read backwards — never a sort of the table, which
 *  grows by every run (ADR-IMPL-077: a year of runs sorted 134 MB on disk, 5 s; this reads 0.2 ms). The hot-query
 *  test checks its plan. */
export const lastRunsSql = (names: readonly string[]) => sql`
  SELECT j.job_name, r.*
  FROM ${jobList(names)}
  CROSS JOIN LATERAL (
    SELECT ${jobRuns.status}, ${jobRuns.startedAt}, ${jobRuns.durationMs} FROM ${jobRuns}
    WHERE ${jobRuns.job} = j.job_name ORDER BY ${jobRuns.startedAt} DESC LIMIT 1
  ) r`;

/** Each job's last finished run (succeeded or failed), by the same probe. */
export const lastFinishedRunsSql = (names: readonly string[]) => sql`
  SELECT j.job_name, r.*
  FROM ${jobList(names)}
  CROSS JOIN LATERAL (
    SELECT ${jobRuns.status}, ${jobRuns.startedAt} FROM ${jobRuns}
    WHERE ${jobRuns.job} = j.job_name AND ${inConst(jobRuns.status, ["succeeded", "failed"])}
    ORDER BY ${jobRuns.startedAt} DESC, ${jobRuns.id} DESC LIMIT 1
  ) r`;

/** How long a singleton run waits for a slot (ADR-IMPL-087): under the cron's minute, so a busy minute's runs are
 *  recorded as skipped and the next minute's tries again, never a queue that grows. */
const SLOT_WAIT_MS = 45_000;
/** How long a run that passed its timeout has to stop on its own (its `signal`) before the runner ends it. */
const GRACE_MS = 30_000;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;

/** Singleton runs at once: each holds a pooled connection for its lock (`reserve`) and needs others for its work, so
 *  they may take at most 40 % of the pool — 4 of the worker's 10 — and at least one (ADR-IMPL-087). */
export function singletonSlots(poolMax: number): number {
  return Math.max(1, Math.floor(poolMax * 0.4));
}

/** A counting gate: `acquire` resolves true once a slot is free, false when `waitMs` passes first. */
function createGate(size: number) {
  let free = size;
  const waiting: Array<(ok: boolean) => void> = [];
  return {
    acquire(waitMs: number): Promise<boolean> {
      if (free > 0) {
        free--;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const grant = (ok: boolean) => {
          clearTimeout(timer);
          resolve(ok);
        };
        const timer = setTimeout(() => {
          const at = waiting.indexOf(grant);
          if (at >= 0) waiting.splice(at, 1);
          resolve(false);
        }, waitMs);
        waiting.push(grant);
      });
    },
    release() {
      const next = waiting.shift();
      if (next) next(true);
      else free++;
    },
  };
}

class JobTimedOut extends Error {
  override name = "JobTimedOut";
}

/** The handler's outcome, or — once its signal has fired and `graceMs` more have passed without it settling — a
 *  rejection: a handler that ignores its signal (a query waiting on a pool, a fetch without a timeout) cannot keep its
 *  run, its lock and its slot forever. What it still does afterwards is no longer the run's. */
function boundedBy<T>(work: Promise<T>, signal: AbortSignal, graceMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    const start = () => {
      timer = setTimeout(() => reject(new JobTimedOut(message)), graceMs);
    };
    if (signal.aborted) start();
    else signal.addEventListener("abort", start, { once: true });
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

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
      setGauge?(n: string, v: number, l?: Record<string, string>): void;
      clearPrefix?(prefix: string): void;
    };
    /** Singleton runs at once; the default is `singletonSlots` of the pool's size. */
    slots?: number;
    slotWaitMs?: number;
    graceMs?: number;
  },
) {
  const registry = new Map<string, JobSpec>();
  const poolMax = (db.raw as { options?: { max?: number } } | undefined)?.options?.max ?? 10;
  const gate = createGate(deps.slots ?? singletonSlots(poolMax));
  // Singleton jobs this process is running: a second run of one is skipped at once, as the lock would skip it, instead
  // of waiting for a slot behind itself.
  const inFlight = new Set<string>();

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
    // through the pool can be "unlocked" on a different connection, which silently does nothing. A slot comes first:
    // with more singleton runs than the pool has connections, every one held its own and waited for another to write
    // its row, and every job stopped until a restart (5 Nov 2026, ADR-IMPL-087).
    let reserved: any = null;
    let slotted = false;
    if (spec.singleton) {
      if (inFlight.has(name)) {
        deps.logger.warn({ job: name }, "job already running, skipped");
        await db.insert(jobRuns).values({ job: name, status: "skipped", finishedAt: sql`now()`, durationMs: 0 });
        return { status: "skipped", durationMs: 0 };
      }
      inFlight.add(name);
      if (!(await gate.acquire(deps.slotWaitMs ?? SLOT_WAIT_MS))) {
        inFlight.delete(name);
        deps.logger.warn({ job: name }, "no free job slot, skipped");
        await db.insert(jobRuns).values({ job: name, status: "skipped", finishedAt: sql`now()`, durationMs: 0 });
        return { status: "skipped", durationMs: 0 };
      }
      slotted = true;
      let ok = false;
      try {
        reserved = await db.raw.reserve();
        [{ ok }] = await reserved`SELECT pg_try_advisory_lock(hashtext(${"job:" + name})) AS ok`;
      } catch (e) {
        reserved?.release();
        gate.release();
        inFlight.delete(name);
        throw e;
      }
      if (!ok) {
        reserved.release();
        reserved = null;
        slotted = false;
        gate.release();
        inFlight.delete(name);
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
    const timeoutMs = spec.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
    const graceMs = deps.graceMs ?? GRACE_MS;
    const timeout = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const [runRow] = await db.insert(jobRuns).values({ job: name, status: "running" }).returning({ id: jobRuns.id });
      if (!runRow) throw new Error(`job ${name}: the job_runs insert returned no row`);
      runId = runRow.id;
      const raw = await boundedBy(
        spec.handler({ db, logger: deps.logger, signal: ac.signal }),
        ac.signal,
        graceMs,
        `job ${name}: still running ${graceMs} ms after its ${timeoutMs} ms timeout`,
      );
      const metrics = numbersOnly(raw);
      const durationMs = Date.now() - started;
      await db
        .update(jobRuns)
        .set({ status: "succeeded", finishedAt: sql`now()`, durationMs, metrics })
        .where(sql`${jobRuns.id} = ${runId}`);
      deps.metrics?.observe("job_duration_ms", durationMs, { job: name });
      deps.metrics?.inc("job_succeeded", { job: name });
      deps.logger.info({ job: name, durationMs, ...(metrics ?? {}) }, "job succeeded");
      return { status: "succeeded", durationMs, metrics };
    } catch (e: unknown) {
      const durationMs = Date.now() - started;
      // Never the error's own text: a failed query's message holds its parameters (AGENTS.md rule 6).
      const error = errorLine(e).slice(0, 2000);
      // A job that stopped part way may say what it did before (retainEach's RetentionIncomplete: its `metrics`).
      const metrics = numbersOnly((e as { metrics?: unknown } | null)?.metrics);
      // No row when the insert itself failed; the result and the log still say so.
      if (runId !== null)
        await db
          .update(jobRuns)
          .set({ status: "failed", finishedAt: sql`now()`, durationMs, error, metrics })
          .where(sql`${jobRuns.id} = ${runId}`);
      deps.metrics?.inc("job_failed", { job: name });
      deps.logger.error({ job: name, durationMs, err: errorForLog(e), ...(metrics ?? {}) }, "job failed");
      return { status: "failed", durationMs, error, metrics };
    } finally {
      clearTimeout(timeout);
      try {
        if (reserved) {
          try {
            await reserved`SELECT pg_advisory_unlock(hashtext(${"job:" + name}))`;
          } finally {
            reserved.release();
          }
        }
      } finally {
        if (slotted) {
          gate.release();
          inFlight.delete(name);
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
    /** Last run per registered job — for /status, dashboards and the "is anything stale?" alert (`lastRunsSql`). */
    async lastRuns(): Promise<Record<string, { status: string; at: Date | null; durationMs: number | null }>> {
      const names = [...registry.keys()];
      if (names.length === 0) return {};
      const rows = (await db.execute(lastRunsSql(names))) as unknown as {
        job_name: string;
        status: string;
        started_at: Date;
        duration_ms: number | null;
      }[];
      return Object.fromEntries(
        rows.map((r) => [r.job_name, { status: r.status, at: r.started_at, durationMs: r.duration_ms }]),
      );
    },
    /** Last finished run per registered job, succeeded or failed — a run still going or skipped behind the lock says
     *  nothing about whether the job works. For /status: a scheduled job whose last finished run failed is failing. */
    async lastFinishedRuns(): Promise<Record<string, { status: string; at: Date }>> {
      const names = [...registry.keys()];
      if (names.length === 0) return {};
      const rows = (await db.execute(lastFinishedRunsSql(names))) as unknown as {
        job_name: string;
        status: string;
        started_at: Date;
      }[];
      return Object.fromEntries(rows.map((r) => [r.job_name, { status: r.status, at: r.started_at }]));
    },
  };
}
export type Jobs = ReturnType<typeof createJobs>;
