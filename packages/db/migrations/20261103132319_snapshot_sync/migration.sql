-- Snapshot sync, no schema change (3 Nov 2026). The column this snapshot adds, catalog.place_photos.policy with its
-- CHECK, is added by a named step of migrate.ts (0056, ADR-IMPL-086), which runs after drizzle: the table itself is
-- 0026's. This migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes
-- nothing; CI fails if it proposes anything.
SELECT 1;
