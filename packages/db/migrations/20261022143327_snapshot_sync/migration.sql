-- Snapshot sync, no schema change (22 Oct 2026). The object this snapshot changes already exists in every database:
-- catalog.fares' key fares_route_cabin_carrier, now a UNIQUE NULLS NOT DISTINCT constraint on (route_from, route_to,
-- cabin, carrier, valid_from, trip) instead of 0006's unique index without the trip (0034). The named step in
-- migrate.ts makes it, on fresh databases too — catalog.fares itself comes from 0006_catalog.sql, after drizzle. This
-- migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI
-- fails if it proposes anything.
SELECT 1;
