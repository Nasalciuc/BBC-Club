-- Snapshot sync, no schema change (ADR-IMPL-042, 8 Oct 2026). The objects this snapshot adds already exist in every
-- database: requests.shown_estimate_amount, requests.shown_estimate_currency and the requests_shown_estimate CHECK
-- (0024). The named step in migrate.ts creates them, on fresh databases too — requests.requests itself comes from
-- 0005_requests.sql, after drizzle. This migration only brings drizzle's snapshot level with the schema, so that
-- `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
