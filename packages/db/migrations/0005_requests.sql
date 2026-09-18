-- Expand-only: requests schema for member fare/offer requests → CRM.
CREATE SCHEMA IF NOT EXISTS requests;

DO $$ BEGIN
  CREATE TYPE requests.request_status AS ENUM ('received', 'assigned', 'quoted', 'booked', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE requests.trip_type AS ENUM ('round', 'oneway', 'multi');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE requests.request_cabin AS ENUM ('business', 'first');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE requests.request_source AS ENUM ('ios', 'android');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS requests.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  reference text NOT NULL,
  member_id text,
  idempotency_key text NOT NULL,
  fare_id uuid,
  offer_id uuid,
  trip_type requests.trip_type NOT NULL,
  cabin requests.request_cabin NOT NULL,
  legs jsonb NOT NULL,
  passengers jsonb NOT NULL,
  price_at_request text,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text NOT NULL,
  note text,
  status requests.request_status DEFAULT 'received' NOT NULL,
  source requests.request_source NOT NULL,
  app_version text,
  sent_to_crm boolean DEFAULT false NOT NULL,
  crm_request_id text,
  sent_at timestamptz,
  last_error text,
  send_attempts integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT requests_legs_nonempty CHECK (jsonb_array_length(legs) >= 1),
  CONSTRAINT requests_one_source CHECK (NOT (fare_id IS NOT NULL AND offer_id IS NOT NULL)),
  CONSTRAINT requests_sync_consistent CHECK (
    (sent_to_crm = false) OR (crm_request_id IS NOT NULL AND sent_at IS NOT NULL)
  ),
  CONSTRAINT requests_contact CHECK (
    length(contact_name) > 1
    AND length(contact_phone) > 6
    AND position('@' in contact_email) > 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS requests_idempotency ON requests.requests (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS requests_reference ON requests.requests (reference);
CREATE INDEX IF NOT EXISTS requests_member ON requests.requests (member_id, created_at)
  WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_unsent ON requests.requests (created_at)
  WHERE sent_to_crm = false;
CREATE INDEX IF NOT EXISTS requests_open ON requests.requests (status)
  WHERE status <> 'closed' AND status <> 'booked';
CREATE INDEX IF NOT EXISTS requests_fare ON requests.requests (fare_id) WHERE fare_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_offer ON requests.requests (offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_crm ON requests.requests (crm_request_id) WHERE crm_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS requests.request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL REFERENCES requests.requests(id) ON DELETE CASCADE,
  status requests.request_status NOT NULL,
  note text,
  actor text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS request_events_request ON requests.request_events (request_id, created_at);

DROP TRIGGER IF EXISTS trg_updated_at ON requests.requests;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON requests.requests
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
