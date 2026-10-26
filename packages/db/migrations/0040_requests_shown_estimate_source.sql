-- Expand-only: who priced the estimate a quote request's search showed (ADR-IMPL-063) — `site`, the company's own site
-- (catalog.site_prices), or `club`, the club's copy of the company's formula (ADR-IMPL-037). Recorded by the server with
-- the estimate (ADR-IMPL-042), never taken from the app. Null on a request without an estimate, on every request stored
-- before this step, and while catalog.site_prices is off: those estimates are the formula's, as before.
-- Numbered 0040, not 0039: a branch in flight beside this one (G3) holds 0039.
-- A named step, like 0029 and 0030: requests.requests is created by 0005_requests.sql, after drizzle, so a column added
-- through a drizzle migration would fail on every fresh database. The drizzle snapshot is brought level by a no-op sync
-- migration (20261025*_snapshot_sync).
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS shown_estimate_source text;

-- A source only beside an estimate, and only one of the two kinds. True or false, never NULL: a CHECK passes when its
-- expression is NULL (0025).
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock writes do not wait for (0029).
ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_shown_estimate_source;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_shown_estimate_source CHECK (
    shown_estimate_source IS NULL
    OR (shown_estimate_amount IS NOT NULL AND shown_estimate_source IN ('site', 'club'))
  ) NOT VALID;
