-- Snapshot sync, no schema change (G1b, the site's price, 25 Oct 2026). The objects this snapshot adds already exist in
-- every database: catalog.site_price_status and catalog.site_prices (0038), requests.requests.shown_estimate_source and
-- its CHECK (0040). The named steps in migrate.ts create them, on fresh databases too — they run after 0006, 0031 and
-- 0005, which create the schemas, catalog.fare_trip and requests.requests. This migration only brings drizzle's
-- snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
