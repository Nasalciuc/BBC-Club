-- Snapshot sync, no schema change (ADR-IMPL-043, 9 Oct 2026). The objects this snapshot adds already exist in every
-- database: catalog.place_photos, its enums place_photo_status and place_photo_source, its CHECKs, the place_photos_due
-- index and the foreign key to catalog.airports (0026). The named step in migrate.ts creates them, on fresh databases
-- too — catalog.airports itself comes from 0006_catalog.sql, after drizzle. This migration only brings drizzle's
-- snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
