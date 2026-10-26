-- Snapshot sync, no schema change (ADR-IMPL-056, 19 Oct 2026). The objects this snapshot adds already exist in every
-- database: the catalog.fare_trip enum, catalog.fares.trip, catalog.airports.description and the
-- airports_description CHECK (0031). The named step in migrate.ts creates them, on fresh databases too —
-- catalog.fares and catalog.airports themselves come from 0006_catalog.sql, after drizzle. This migration only brings
-- drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes
-- anything.
SELECT 1;
