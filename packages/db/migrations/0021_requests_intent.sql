-- Expand-only: optional intent and the fare an alternative replaces. No foreign key.
-- drizzle-kit generate cannot emit this. schemaFilter omits requests, and the snapshot
-- has no requests tables, so generate asks to create unrelated platform indexes.
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS replaces_fare_id uuid;

ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_intent;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_intent CHECK (intent IS NULL OR intent IN ('quote', 'alternative'));

CREATE INDEX IF NOT EXISTS requests_replaces_fare ON requests.requests (replaces_fare_id)
  WHERE replaces_fare_id IS NOT NULL;
