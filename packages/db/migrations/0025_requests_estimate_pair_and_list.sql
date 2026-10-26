-- Two corrections to requests.requests, from the review of ADR-IMPL-042. A new named step rather than an edit of 0024:
-- the ledger (platform.extras_applied) records a step's name, not its content, so wherever 0024 has already run an
-- edited 0024 would never run again. Like 0024, a named step because requests.requests comes from 0005_requests.sql,
-- after drizzle; the drizzle snapshot is brought level by a no-op sync migration (20261008*_snapshot_sync).

-- 1. The estimate pair: both or neither, a positive amount, US dollars only. 0024's CHECK let half a pair in — a CHECK
--    passes when its expression is NULL, so `amount > 0 AND currency = 'USD'` accepted (NULL, 'USD') and (2055, NULL).
--    Each side now says IS NOT NULL. The server writes both or neither; the UPDATE only clears a half pair written by
--    hand, so the constraint can be added wherever this step runs.
UPDATE requests.requests
SET shown_estimate_amount = NULL, shown_estimate_currency = NULL
WHERE (shown_estimate_amount IS NULL) <> (shown_estimate_currency IS NULL);
ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_shown_estimate;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_shown_estimate CHECK (
    (shown_estimate_amount IS NULL AND shown_estimate_currency IS NULL)
    OR (
      shown_estimate_amount IS NOT NULL AND shown_estimate_currency IS NOT NULL
      AND shown_estimate_amount > 0 AND shown_estimate_currency = 'USD'
    )
  );

-- 2. The member's list puts requests in progress first, newest first within each group, so an older request still in
--    progress never drops off the 50 the list shows behind finished ones. The second key is the list's ORDER BY
--    expression (requests.repo.ts, listForMemberSelect): the list reads 51 index entries, however many requests a
--    member has. requests_member stays — the account deletion's update reads it.
CREATE INDEX IF NOT EXISTS requests_member_list
  ON requests.requests (member_id, (status IN ('booked', 'closed')), created_at DESC)
  WHERE member_id IS NOT NULL;
