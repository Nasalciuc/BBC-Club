-- Expand-only: the indicative price the search showed for a quote request's route, recomputed by the server when the
-- request is created (ADR-IMPL-042). Whole US dollars, from the company's formula (ADR-IMPL-037). Null on every other
-- request, and on a quote when estimates are off, the rules are missing, or the route has a published fare.
-- A named step, like 0005 and 0021 before it: requests.requests is created by 0005_requests.sql, after drizzle, so a
-- column added through a drizzle migration would fail on every fresh database. The drizzle snapshot is brought level by
-- a no-op sync migration (20261008*_snapshot_sync).
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS shown_estimate_amount integer,
  ADD COLUMN IF NOT EXISTS shown_estimate_currency text;

-- Both or neither, a positive amount, US dollars only (EstimateVM.currency is the literal USD).
ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_shown_estimate;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_shown_estimate CHECK (
    (shown_estimate_amount IS NULL AND shown_estimate_currency IS NULL)
    OR (shown_estimate_amount > 0 AND shown_estimate_currency = 'USD')
  );
