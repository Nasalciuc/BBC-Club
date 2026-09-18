-- Expand-only db:verify fitness for requests (Branch 3).
-- Safe on DBs that already applied 0005_requests.sql.

DO $$ BEGIN
  CREATE TYPE requests.request_source AS ENUM ('ios', 'android');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE requests.requests
  ALTER COLUMN source TYPE requests.request_source
  USING source::requests.request_source;

CREATE INDEX IF NOT EXISTS requests_fare ON requests.requests (fare_id) WHERE fare_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_offer ON requests.requests (offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_crm ON requests.requests (crm_request_id) WHERE crm_request_id IS NOT NULL;
