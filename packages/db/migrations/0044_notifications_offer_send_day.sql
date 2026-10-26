-- The daily offer cap counts the day a push is sent, in the member's zone (notifications MODULE.md): it reads a member's
-- offer pushes by scheduled_for, a window of a few days around the send. notif_inbox (member_id, created_at) cannot
-- bound that read — a personal offer published for later is created days before it is sent — so without this index the
-- cap would read every row a member has. Partial on the two offer categories, which the query writes as literals.
-- CONCURRENTLY: applied outside a transaction by migrate.ts (applyConcurrentIndexFile in scripts/concurrent-indexes.ts),
-- so pushes keep being written.
-- The drizzle snapshot is brought level by a no-op sync migration (*_snapshot_sync).
CREATE INDEX CONCURRENTLY IF NOT EXISTS notif_offer_sends
  ON notifications.notifications (member_id, scheduled_for)
  WHERE category IN ('offers_personal', 'offers_broadcast');
