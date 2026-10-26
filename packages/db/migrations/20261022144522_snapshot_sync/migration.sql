-- Snapshot sync, no schema change (g5-offer-push-at-publish, 22 Oct 2026). The object this snapshot adds already exists
-- in every database: notifications.campaigns.not_before (0036). The named step in migrate.ts creates it, on fresh
-- databases too — it runs after 0018, which creates notifications.campaigns. This migration only brings drizzle's
-- snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes anything.
SELECT 1;
