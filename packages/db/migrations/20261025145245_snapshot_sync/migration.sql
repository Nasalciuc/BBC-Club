-- Snapshot sync, no schema change (G2, the site's deals, 25 Oct 2026). The objects this snapshot adds already exist in
-- every database: catalog.site_routes.valid_until, its default and its CHECK site_routes_validity (0042). The named step
-- in migrate.ts creates them, on fresh databases too — it runs after 0028, which creates catalog.site_routes. drizzle's
-- own statement would give every existing row the migration's day (ADD COLUMN … DEFAULT now() + 24 h); 0042 gives each
-- row its own read + 24 hours. This migration only brings drizzle's snapshot level with the schema, so that
-- `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
