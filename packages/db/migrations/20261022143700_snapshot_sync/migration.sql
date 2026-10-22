-- Snapshot sync, no schema change (22 Oct 2026). The objects this snapshot adds already exist in every database: the
-- fares_duration_pos CHECK on catalog.fares and the airports_coordinates CHECK on catalog.airports (0035). The named
-- step in migrate.ts creates them, on fresh databases too — catalog.fares and catalog.airports themselves come from
-- 0006_catalog.sql, after drizzle. This migration only brings drizzle's snapshot level with the schema, so that
-- `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
