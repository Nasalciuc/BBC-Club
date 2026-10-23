-- Expand-only: a broadcast offer published for later (proposals.offers.publish_at in the future) is pushed when it is
-- published, never while it is still invisible (a tap would open a 404). on-offer-published records the offer's
-- publishedAt here, and campaign-fanout does not claim a campaign before it. Null — every campaign recorded before this
-- step, and any without a time — is due at once, as before. A named step: the table comes from 0018, itself named.
-- The drizzle snapshot is brought level by a no-op sync migration (*_snapshot_sync).
ALTER TABLE notifications.campaigns ADD COLUMN IF NOT EXISTS not_before timestamptz;
