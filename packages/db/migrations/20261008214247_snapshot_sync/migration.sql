-- Snapshot sync, no schema change (ADR-IMPL-042, review of 8 Oct 2026). What this snapshot changes already exists in
-- every database: the requests_shown_estimate CHECK that refuses half a pair, and the requests_member_list index
-- (0025). The named step in migrate.ts makes them, on fresh databases too — requests.requests itself comes from
-- 0005_requests.sql, after drizzle. This migration only brings drizzle's snapshot level with the schema, so that
-- `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
