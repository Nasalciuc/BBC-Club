-- Snapshot sync, no schema change (ADR-IMPL-064, 25 Oct 2026). The objects this snapshot adds already exist in every
-- database: the catalog.place_landmark_kind and catalog.outside_source enums, catalog.place_landmarks with its CHECKs,
-- its place_landmarks_one_marker index and its foreign key to catalog.airports, and catalog.source_holds (0039). The
-- named step in migrate.ts creates them, on fresh databases too — catalog.airports itself comes from 0006_catalog.sql,
-- after drizzle. This migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate`
-- proposes nothing; CI fails if it proposes anything.
SELECT 1;
