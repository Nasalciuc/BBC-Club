import { and, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { errorForLog, withTx } from "@bbc/db";
import { DeleteStopped, anyOf, deleteInBatches, eqConst, inConst, retainEach } from "@bbc/db/helpers";
import {
  eventDeliveries,
  eventDlq,
  flags as flagsTable,
  jobRuns,
  kafkaProcessed,
  rateLimitState,
  rateLimits,
} from "../infrastructure/schema";
import type { Jobs } from "./index";
import type { Metrics } from "../telemetry/metrics";
import { parseValue } from "../flags";
import { applyDbGauges, collectDbReport, collectDbSnapshot, maybeAlertOps } from "../observe/db-health";

/** A run that finished: what lastFinishedRunsSql reads. */
const FINISHED = ["succeeded", "failed"] as const;
/** job_runs again, inside the retention's subqueries: its columns through the schema, never as text. */
const last = alias(jobRuns, "last");
const later = alias(jobRuns, "later");

/** Jobs platform owns. Modules register their own (expire-offers, sync-mirror, receipts…). */
/**
 * What the retention deletes of `job_runs`: 30 days of runs, and each job's last run and last finished run whenever they
 * were (/status reads both: a failure followed only by skipped or running runs still fails). A finished run goes unless
 * it is its job's last finished one, in lastFinishedRunsSql's order (started_at, then id); any other run once a newer
 * run exists. Two statements: one OR of the two kept the planner off the indexes (3.7 s a batch, not 30 ms). Each
 * probes its job's runs by index — the last finished one on `job_runs_last_finished`, a newer one on
 * `job_runs_job_started` — and the hot-query test plans both; which rows to look at is the planner's (the whole table
 * is old enough on the first night).
 */
export const jobRunsRetention = {
  finished: sql`${jobRuns.startedAt} < now() - interval '30 days' AND ${inConst(jobRuns.status, FINISHED)} AND ${jobRuns.id} <> (
    SELECT ${last.id} FROM ${jobRuns} AS ${last} WHERE ${last.job} = ${jobRuns.job} AND ${inConst(last.status, FINISHED)}
    ORDER BY ${last.startedAt} DESC, ${last.id} DESC LIMIT 1)`,
  others: sql`${jobRuns.startedAt} < now() - interval '30 days' AND NOT ${inConst(jobRuns.status, FINISHED)} AND EXISTS (
    SELECT 1 FROM ${jobRuns} AS ${later} WHERE ${later.job} = ${jobRuns.job} AND ${later.startedAt} > ${jobRuns.startedAt})`,
};

/**
 * Puts back to pending the `paused` deliveries of these consumers, `batch` at a time, each batch its own statement and
 * so its own commit: one UPDATE of a large backlog could outrun the role's 15 s statement timeout, fail, and leave every
 * delivery parked, run after run. It stops before the next batch once `budgetMs` has passed or `signal` has fired, and
 * says so (`capped`): the next run resumes the rest.
 */
export async function resumeParked(
  db: any,
  consumers: string[],
  opts: { batch?: number; budgetMs?: number; signal?: AbortSignal } = {},
): Promise<{ resumed: number; capped: boolean }> {
  const batch = opts.batch ?? 1_000;
  const deadline = performance.now() + (opts.budgetMs ?? 10_000);
  let resumed = 0;
  if (consumers.length === 0) return { resumed, capped: false };
  for (;;) {
    const picked = db
      .select({ id: eventDeliveries.id })
      .from(eventDeliveries)
      .where(and(eqConst(eventDeliveries.status, "paused"), anyOf(eventDeliveries.consumer, consumers, "text")))
      .limit(batch);
    const rows = await db
      .update(eventDeliveries)
      .set({ status: "pending", runAfter: sql`now()` })
      .where(and(eqConst(eventDeliveries.status, "paused"), inArray(eventDeliveries.id, picked)))
      .returning({ id: eventDeliveries.id });
    resumed += rows.length;
    if (rows.length < batch) return { resumed, capped: false };
    if (opts.signal?.aborted || performance.now() >= deadline) return { resumed, capped: true };
  }
}

export function registerPlatformJobs(jobs: Jobs, metrics: Metrics) {
  jobs.register("partitions", {
    description: "create journal partitions for the coming months",
    cron: "0 2 * * *",
    singleton: true,
    timeoutMs: 60_000,
    handler: async ({ db, logger }) => {
      // Creating a partition takes the journal's lock as dropping one does (X8): it waits 3 s at most, else the next
      // day's run tries again (three months are made ahead). In UTC (X7): the function cuts its months with now() and
      // ::date, in the session's time zone, and a session in New York left five hours between two months' partitions
      // that no event could be written into. SET LOCAL: PgBouncer pools by transaction.
      let partitionsDeferred = 0;
      try {
        await withTx(db, async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
          await tx.execute(sql`SET LOCAL TimeZone = 'UTC'`);
          await tx.execute(sql`SELECT platform.ensure_event_partitions(3)`);
        });
      } catch (err) {
        if (errorForLog(err).sqlstate !== "55P03") throw err; // lock_not_available
        partitionsDeferred = 1;
        logger.warn({ job: "partitions" }, "journal partitions left for tomorrow: the journal stayed locked past 3 s");
      }
      return { ok: 1, partitionsDeferred };
    },
  });

  jobs.register("retention", {
    description:
      "drop journal partitions older than 24 months; delete, in batches, what platform keeps for a while (ADR-IMPL-077)",
    cron: "0 4 * * *",
    singleton: true,
    timeoutMs: 300_000,
    handler: async ({ db, logger, signal }) =>
      // Each step on its own (retainEach): one that fails leaves the others to run, and the run fails at the end with
      // what each did; the steps the job's time did not reach are `<step>Skipped`.
      retainEach(signal, {
        // X8: dropping a partition takes ACCESS EXCLUSIVE on the journal, and while it waits behind a long read every
        // event insert (every write that publishes) queues behind it — locally a 12 s SELECT held each one 10 s. The
        // drop waits 3 s at most (SET LOCAL: PgBouncer pools by transaction) and is otherwise left for tomorrow's run.
        // In UTC, as the partitions job (X7).
        partitions: async () => {
          try {
            const partitionsDropped = await withTx(db, async (tx) => {
              await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
              await tx.execute(sql`SET LOCAL TimeZone = 'UTC'`);
              const [{ dropped }]: any = await tx.execute(
                sql`SELECT platform.drop_old_event_partitions(24) AS dropped`,
              );
              return dropped as number;
            });
            return { partitionsDropped, partitionsDeferred: 0 };
          } catch (err) {
            if (errorForLog(err).sqlstate !== "55P03") throw err; // lock_not_available
            logger.warn(
              { job: "retention" },
              "journal partitions left for tomorrow: the journal stayed locked past 3 s",
            );
            return { partitionsDropped: 0, partitionsDeferred: 1 };
          }
        },
        // A delivery done 30 days ago is history; a dead or paused one waits for its operator.
        deliveries: () =>
          deleteInBatches(
            db,
            eventDeliveries,
            sql`${eqConst(eventDeliveries.status, "done")} AND ${eventDeliveries.processedAt} < now() - interval '30 days'`,
            { signal },
          ),
        rateLimits: () => deleteInBatches(db, rateLimits, sql`${rateLimits.expiresAt} < now()`, { signal }),
        rateLimitState: () =>
          deleteInBatches(db, rateLimitState, sql`${rateLimitState.tat} < now() - interval '1 day'`, { signal }),
        // 30 days of runs, and each job's last run and last finished run whenever they were (jobRunsRetention).
        jobRuns: async () => {
          const finished = await deleteInBatches(db, jobRuns, jobRunsRetention.finished, { signal });
          try {
            const others = await deleteInBatches(db, jobRuns, jobRunsRetention.others, { signal });
            return { deleted: finished.deleted + others.deleted, capped: finished.capped || others.capped };
          } catch (err) {
            throw err instanceof DeleteStopped ? new DeleteStopped(finished.deleted + err.deleted, err.cause) : err;
          }
        },
        // Twice Kafka's default retention (7 days): a message a topic still holds is still recognised as processed.
        kafkaProcessed: () =>
          deleteInBatches(db, kafkaProcessed, sql`${kafkaProcessed.processedAt} < now() - interval '14 days'`, {
            signal,
          }),
        deadLetters: () =>
          deleteInBatches(db, eventDlq, sql`${eventDlq.failedAt} < now() - interval '90 days'`, { signal }),
      }),
  });

  jobs.register("queue-health", {
    description: "log queue depth and age; the alert rule reads these metrics",
    cron: "*/10 * * * *",
    timeoutMs: 15_000,
    handler: async ({ db, logger, signal }) => {
      // A delivery parked while its flag said paused goes back to pending once the flag no longer does (ADR-IMPL-080,
      // RUNBOOK § Pause a consumer). "Paused" is decided as consumerPauseState decides it: the value through the flags
      // reader's own parser, so a hand-written value it rejects (`{"enabled":true,"variant":null}`) resumes here too.
      const parked = await db
        .selectDistinct({ consumer: eventDeliveries.consumer, value: flagsTable.value })
        .from(eventDeliveries)
        .leftJoin(flagsTable, sql`${flagsTable.key} = 'consumer.' || ${eventDeliveries.consumer} || '.paused'`)
        .where(eqConst(eventDeliveries.status, "paused"));
      const running = (parked as { consumer: string; value: unknown }[])
        .filter((r) => parseValue(r.value)?.enabled !== true)
        .map((r) => r.consumer);
      // In batches, within 10 of the job's 15 s: a backlog larger than that resumes over the next runs.
      const { resumed, capped } = await resumeParked(db, running, { signal });
      if (capped) logger.warn({ resumed }, "paused deliveries resumed in part: the next run resumes the rest");
      const rows: any[] = await db.execute(sql`
        SELECT consumer, count(*) FILTER (WHERE status='pending')::int AS pending,
               COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='pending')))::int, 0) AS oldest_s
        FROM platform.event_deliveries GROUP BY consumer HAVING count(*) FILTER (WHERE status='pending') > 0`);
      for (const r of rows)
        if (r.oldest_s > 300)
          logger.warn({ consumer: r.consumer, pending: r.pending, oldestSeconds: r.oldest_s }, "queue lagging");
      return { consumersWithBacklog: rows.length, resumed, resumeCapped: capped ? 1 : 0 };
    },
  });

  jobs.register("db-observe", {
    description: "set DB gauges on /metrics; POST OPS_WEBHOOK when pool_waiting>0 for 2 min or oldest_tx>30s",
    cron: "* * * * *",
    timeoutMs: 15_000,
    handler: async ({ db, logger, signal }) => {
      const snap = await collectDbSnapshot(db, logger);
      applyDbGauges(metrics, snap);
      const alerts = await maybeAlertOps(snap, logger, Date.now(), signal);
      return {
        connections: snap.connections.reduce((s, r) => s + r.n, 0),
        lockWaits: snap.lockWaits,
        poolWaiting: snap.poolWaiting ?? -1,
        oldestTxSeconds: snap.oldestTxSeconds,
        alerts,
      };
    },
  });

  jobs.register("db-report", {
    description:
      "weekly pg_stat_statements + unused-index report; GET /v1/internal/db-report reads the same live query",
    cron: "0 9 * * 1",
    singleton: true,
    timeoutMs: 60_000,
    handler: async ({ db, logger }) => {
      const report = await collectDbReport(db);
      logger.info(
        {
          statsReset: report.statsReset,
          statementsReset: report.statementsReset,
          statsAgeDays: report.statsAgeDays,
          slowestByMean: report.slowestByMean.length,
          unusedIndexes: report.unusedIndexes.length,
        },
        "db-report",
      );
      return {
        slowestByMean: report.slowestByMean.length,
        unusedIndexes: report.unusedIndexes.length,
        statsAgeDays: report.statsAgeDays ?? -1,
      };
    },
  });
}
