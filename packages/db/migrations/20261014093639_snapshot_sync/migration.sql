-- Snapshot sync, no schema change (ADR-IMPL-046, 14 Oct 2026). The objects this snapshot adds already exist in every
-- database: requests.published_at_request, requests.published_source_at_request and the requests_published_at_request
-- CHECK (0029). The named step in migrate.ts creates them, on fresh databases too — requests.requests itself comes from
-- 0005_requests.sql, after drizzle. This migration only brings drizzle's snapshot level with the schema, so that
-- `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
