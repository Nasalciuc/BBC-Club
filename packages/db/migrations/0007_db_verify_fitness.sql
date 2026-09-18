-- Expand-only fitness fixes for db:verify (Branch 3 requests + Branch 4 catalog).
-- Idempotent: safe on DBs that already applied 0005/0006.

-- ── requests: source must be enum; *_id columns must be indexed ───────────────
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

-- ── catalog.airports: created_at (AGENTS.md / verify §5) ─────────────────────
ALTER TABLE catalog.airports
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ── catalog.fares: trigger must be named trg_updated_at (verify §6) ──────────
DROP TRIGGER IF EXISTS fares_set_updated_at ON catalog.fares;
DROP TRIGGER IF EXISTS trg_updated_at ON catalog.fares;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON catalog.fares
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
