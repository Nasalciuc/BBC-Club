-- Expand-only: the fare's published price and its source as they stood when the member asked, recorded by the server
-- from the fare (catalog.fares.published_price, published_source) when a request is made from a fare — never taken from
-- the app (ADR-IMPL-046). A request's detail shows it struck beside the fare once the quote is ready (Figma 233:4204:
-- `$7,850 · BA PUBLISHED · 16 SEP`). Null on a request made from an offer or as a quote, on a fare without a published
-- price, on a fare re-priced since the member opened it, and on every request made before this step.
-- A named step, like 0024 and 0025: requests.requests is created by 0005_requests.sql, after drizzle, so a column added
-- through a drizzle migration would fail on every fresh database. The drizzle snapshot is brought level by a no-op sync
-- migration (20261014*_snapshot_sync).
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS published_at_request numeric(10, 2),
  ADD COLUMN IF NOT EXISTS published_source_at_request text;

-- Both or neither, a positive amount, a source that says something: a struck price always carries its source (FTC,
-- PricePair). Each side says IS NOT NULL — a CHECK passes when its expression is NULL (0025).
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock that writes do not wait for.
ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_published_at_request;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_published_at_request CHECK (
    (published_at_request IS NULL AND published_source_at_request IS NULL)
    OR (
      published_at_request IS NOT NULL AND published_source_at_request IS NOT NULL
      AND published_at_request > 0 AND length(btrim(published_source_at_request)) > 0
    )
  ) NOT VALID;
