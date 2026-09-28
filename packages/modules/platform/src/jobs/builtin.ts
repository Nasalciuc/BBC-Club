import { sql } from "drizzle-orm";
import type { Jobs } from "./index";
import type { Metrics } from "../telemetry/metrics";
import { applyDbGauges, collectDbReport, collectDbSnapshot, maybeAlertOps } from "../observe/db-health";

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
    description: "drop journal partitions older than 24 months; delete done deliveries older than 30 days",
    cron: "0 4 * * *",
    singleton: true,
    timeoutMs: 300_000,
    handler: async ({ db }) => {
      const [{ dropped }]: any = await db.execute(sql`SELECT platform.drop_old_event_partitions(24) AS dropped`);
      const del: any = await db.execute(
        sql`DELETE FROM platform.event_deliveries WHERE status='done' AND processed_at < now() - interval '30 days'`,
      );
      const rl: any = await db.execute(sql`DELETE FROM platform.rate_limits WHERE expires_at < now()`);
      const rlState: any = await db.execute(
        sql`DELETE FROM platform.rate_limit_state WHERE tat < now() - interval '1 day'`,
      );
      const otpCd: any = await db.execute(
        sql`DELETE FROM auth.otp_cooldown WHERE last_sent_at < now() - interval '1 day'`,
      );
      return {
        partitionsDropped: dropped,
        deliveriesDeleted: del.count ?? del.rowCount ?? 0,
        rateLimitsDeleted: rl.count ?? rl.rowCount ?? 0,
        rateLimitStateDeleted: rlState.count ?? rlState.rowCount ?? 0,
        otpCooldownsDeleted: otpCd.count ?? otpCd.rowCount ?? 0,
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
