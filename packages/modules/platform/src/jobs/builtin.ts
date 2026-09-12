import { sql } from "drizzle-orm";
import type { Jobs } from "./index";

/** Jobs platform owns. Modules register their own (expire-offers, sync-mirror, receipts…). */
export function registerPlatformJobs(jobs: Jobs) {
  jobs.register("partitions", {
    description: "create journal partitions for the coming months",
    singleton: true, timeoutMs: 60_000,
    handler: async ({ db }) => { await db.execute(sql`SELECT platform.ensure_event_partitions(3)`); return { ok: 1 }; },
  });

  jobs.register("retention", {
    description: "drop journal partitions older than 24 months; delete done deliveries older than 30 days",
    singleton: true, timeoutMs: 300_000,
    handler: async ({ db }) => {
      const [{ dropped }]: any = await db.execute(sql`SELECT platform.drop_old_event_partitions(24) AS dropped`);
      const del: any = await db.execute(sql`DELETE FROM platform.event_deliveries WHERE status='done' AND processed_at < now() - interval '30 days'`);
      const rl: any = await db.execute(sql`DELETE FROM platform.rate_limits WHERE expires_at < now()`);
      return { partitionsDropped: dropped, deliveriesDeleted: del.count ?? del.rowCount ?? 0, rateLimitsDeleted: rl.count ?? rl.rowCount ?? 0 };
    },
  });

  jobs.register("queue-health", {
    description: "log queue depth and age; the alert rule reads these metrics",
    timeoutMs: 15_000,
    handler: async ({ db, logger }) => {
      const rows: any[] = await db.execute(sql`
        SELECT consumer, count(*) FILTER (WHERE status='pending')::int AS pending,
               COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='pending')))::int, 0) AS oldest_s
        FROM platform.event_deliveries GROUP BY consumer HAVING count(*) FILTER (WHERE status='pending') > 0`);
      for (const r of rows) if (r.oldest_s > 300) logger.warn({ consumer: r.consumer, pending: r.pending, oldestSeconds: r.oldest_s }, "queue lagging");
      return { consumersWithBacklog: rows.length };
    },
  });
}
