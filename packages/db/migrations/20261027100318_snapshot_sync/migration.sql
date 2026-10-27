-- Snapshot sync, no schema change (27 Oct 2026). The objects this snapshot adds are made by named steps of migrate.ts,
-- which run after drizzle: platform.generations and the airports_popularity index (0045, 0046, ADR-IMPL-075). This
-- migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI
-- fails if it proposes anything.
SELECT 1;
