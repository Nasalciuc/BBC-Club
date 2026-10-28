-- Snapshot sync, no schema change (28 Oct 2026). The indexes this snapshot adds, notifications.notifications_retention
-- and platform.job_runs_last_finished, are built CONCURRENTLY by a named step of migrate.ts (0054, ADR-IMPL-077), which
-- runs after drizzle. This migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit
-- generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
