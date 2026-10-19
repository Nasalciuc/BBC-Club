-- Expand-only: an offer's rating, as the offer cards print it beside the city (02 and 16: `★ 4.8`) — given by whoever
-- makes the offer, the CRM or a campaign through POST /v1/internal/offers, and never computed here (ADR-IMPL-056).
-- Null, and no star shown, on an offer made without one and on every offer made before this step. An offer never
-- changes once made (a retry with another rating is a 409), so neither does its rating.
-- A named step, like the other steps of ADR-IMPL-056, though proposals.offers comes from drizzle's own first migration
-- (20260914163714_sour_jamie_braddock): drizzle's migrations run before every named step, so this one finds the table
-- on a fresh database too — as 0009 and 0016 find notifications.notifications — and, being a named step, it can
-- validate its CHECK in a transaction of its own (0029), which drizzle's migrator, one transaction for every pending
-- migration, cannot. The drizzle snapshot is brought level by a no-op sync migration (20261019*_snapshot_sync).
ALTER TABLE proposals.offers ADD COLUMN IF NOT EXISTS rating numeric(2, 1);

-- One to five stars, to one decimal place (the type keeps one).
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock writes do not wait for (0029).
ALTER TABLE proposals.offers DROP CONSTRAINT IF EXISTS offers_rating;
ALTER TABLE proposals.offers
  ADD CONSTRAINT offers_rating CHECK (rating IS NULL OR rating BETWEEN 1.0 AND 5.0) NOT VALID;
