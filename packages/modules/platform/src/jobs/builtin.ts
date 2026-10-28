import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { deleteInBatches, eqConst, inConst } from "@bbc/db/helpers";
import {
  eventDeliveries,
  eventDlq,
  jobRuns,
  kafkaProcessed,
  rateLimitState,
  rateLimits,
} from "../infrastructure/schema";
import type { Jobs } from "./index";
import type { Metrics } from "../telemetry/metrics";
import { applyDbGauges, collectDbReport, collectDbSnapshot, maybeAlertOps } from "../observe/db-health";

/** A run that finished: what lastFinishedRunsSql reads. */
const FINISHED = ["succeeded", "failed"] as const;
/** job_runs again, inside the retention's subqueries: its columns through the schema, never as text. */
const last = alias(jobRuns, "last");
const later = alias(jobRuns, "later");

/** Jobs platform owns. Modules register their own (expire-offers, sync-mirror, receipts…). */
export function registerPlatformJobs(jobs: Jobs, metrics: Metrics) {
  jobs.register("partitions", {
    description: "create journal partitions for the coming months",
    cron: "0 2 * * *",
    singleton: true,
    timeoutMs: 60_000,
    handler: async ({ db }) => {
      await db.execute(sql`SELECT platform.ensure_event_partitions(3)`);
      return { ok: 1 };
    },
  });

  jobs.register("retention", {
    description:
      "drop journal partitions older than 24 months; delete, in batches, what platform keeps for a while (ADR-IMPL-077)",
    cron: "0 4 * * *",
    singleton: true,
    timeoutMs: 300_000,
    handler: async ({ db, signal }) => {
      const [{ dropped }]: any = await db.execute(sql`SELECT platform.drop_old_event_partitions(24) AS dropped`);
      return {
        partitionsDropped: dropped,
        // A delivery done 30 days ago is history; a dead or paused one waits for its operator.
        deliveriesDeleted: await deleteInBatches(
          db,
          eventDeliveries,
          sql`${eqConst(eventDeliveries.status, "done")} AND ${eventDeliveries.processedAt} < now() - interval '30 days'`,
          { signal },
        ),
        rateLimitsDeleted: await deleteInBatches(db, rateLimits, sql`${rateLimits.expiresAt} < now()`, { signal }),
        rateLimitStateDeleted: await deleteInBatches(
          db,
          rateLimitState,
          sql`${rateLimitState.tat} < now() - interval '1 day'`,
          { signal },
        ),
        // 30 days of runs, and each job's last run and last finished run whenever they were (/status reads both: a
        // failure followed only by skipped or running runs still fails). A finished run goes unless it is its job's last
        // finished one, in lastFinishedRunsSql's order (started_at, then id); any other run once a newer run exists. Two
        // statements, each on job_runs_job_started: one OR of the two kept the planner off it (3.7 s a batch, not 30 ms).
        jobRunsDeleted:
          (await deleteInBatches(
            db,
            jobRuns,
            sql`${jobRuns.startedAt} < now() - interval '30 days' AND ${inConst(jobRuns.status, FINISHED)} AND ${jobRuns.id} <> (
              SELECT ${last.id} FROM ${jobRuns} AS ${last} WHERE ${last.job} = ${jobRuns.job} AND ${inConst(last.status, FINISHED)}
              ORDER BY ${last.startedAt} DESC, ${last.id} DESC LIMIT 1)`,
            { signal },
          )) +
          (await deleteInBatches(
            db,
            jobRuns,
            sql`${jobRuns.startedAt} < now() - interval '30 days' AND NOT ${inConst(jobRuns.status, FINISHED)} AND EXISTS (
              SELECT 1 FROM ${jobRuns} AS ${later} WHERE ${later.job} = ${jobRuns.job} AND ${later.startedAt} > ${jobRuns.startedAt})`,
            { signal },
          )),
        // Twice Kafka's default retention (7 days): a message a topic still holds is still recognised as processed.
        kafkaProcessedDeleted: await deleteInBatches(
          db,
          kafkaProcessed,
          sql`${kafkaProcessed.processedAt} < now() - interval '14 days'`,
          { signal },
        ),
        deadLettersDeleted: await deleteInBatches(
          db,
          eventDlq,
          sql`${eventDlq.failedAt} < now() - interval '90 days'`,
          { signal },
        ),
      };
    },
  });

  jobs.register("queue-health", {
    description: "log queue depth and age; the alert rule reads these metrics",
    cron: "*/10 * * * *",
    timeoutMs: 15_000,
    handler: async ({ db, logger }) => {
      const rows: any[] = await db.execute(sql`
        SELECT consumer, count(*) FILTER (WHERE status='pending')::int AS pending,
               COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='pending')))::int, 0) AS oldest_s
        FROM platform.event_deliveries GROUP BY consumer HAVING count(*) FILTER (WHERE status='pending') > 0`);
      for (const r of rows)
        if (r.oldest_s > 300)
          logger.warn({ consumer: r.consumer, pending: r.pending, oldestSeconds: r.oldest_s }, "queue lagging");
      return { consumersWithBacklog: rows.length };
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
