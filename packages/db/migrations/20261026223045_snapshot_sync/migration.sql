-- Snapshot sync, no schema change (26 Oct 2026). The object this snapshot adds already exists in every database: the
-- notif_offer_sends index on notifications.notifications (0044). The named step in migrate.ts creates it CONCURRENTLY,
-- on fresh databases too — it runs after drizzle, which creates notifications.notifications. This migration only brings
-- drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes
-- anything.
SELECT 1;
