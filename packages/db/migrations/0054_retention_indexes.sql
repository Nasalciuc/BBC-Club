-- ADR-IMPL-077 (R4, R5): what the nightly retention and /status read, each by its own partial index. CONCURRENTLY:
-- applied outside a transaction by migrate.ts, so notifications and job runs keep being written while they build.
-- retention-notifications deletes, oldest first and in batches, the notifications that reached their end 90 days ago:
-- the job's own predicate, its statuses as it writes them (inConst), so the planner proves it and nothing else reads it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_retention ON notifications.notifications (created_at)
  WHERE status IN ('sent', 'delivered', 'failed', 'suppressed');
-- Each job's last finished run in lastFinishedRunsSql's order (started_at, then id): /status and the retention's
-- `id <> (… LIMIT 1)` read it from the top, without a sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_runs_last_finished ON platform.job_runs (job, started_at DESC, id DESC)
  WHERE status IN ('succeeded', 'failed');
