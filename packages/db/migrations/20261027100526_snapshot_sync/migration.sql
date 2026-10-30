-- Snapshot sync, no schema change (27 Oct 2026). The index this snapshot adds, catalog.demand_daily_from_day, is built
-- CONCURRENTLY by a named step of migrate.ts (0049, ADR-IMPL-077), which runs after drizzle. This migration only brings
-- drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes
-- anything.
SELECT 1;
