-- Snapshot sync, no schema change (ADR-IMPL-045, 12 Oct 2026). The objects this snapshot adds already exist in every
-- database: catalog.site_places and catalog.site_routes, their CHECKs, the site_places_airport and site_routes_cms_id
-- indexes, and the foreign keys to catalog.airports and between the two (0028). The named step in migrate.ts creates
-- them, on fresh databases too — catalog.airports itself comes from 0006_catalog.sql, after drizzle. This migration
-- only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it
-- proposes anything.
SELECT 1;
