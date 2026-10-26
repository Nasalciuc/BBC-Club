-- Campaigns: a broadcast offer is recorded once by the delivery; the campaign-fanout job pages through
-- the audience (members.audiencePage) and writes the notifications, one transaction per 1 000 members.

-- The fitness function requires status columns to be enums (db:verify §7).
DO $$ BEGIN
  CREATE TYPE notifications.campaign_status AS ENUM ('pending', 'running', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  source_event_id text NOT NULL UNIQUE,              -- a re-delivered event cannot start a second campaign
  category notifications.notification_category NOT NULL,
  title text NOT NULL,
  body text,
  deep_link text,
  last_member_id text,                               -- keyset cursor: a crash resumes after the last page
  status notifications.campaign_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT campaigns_finished_consistent CHECK ((status = 'done') = (finished_at IS NOT NULL))
);

-- Lookup by offer (RUNBOOK: "which campaign did this offer start?").
CREATE INDEX IF NOT EXISTS campaigns_offer ON notifications.campaigns (offer_id);
-- The claim reads open campaigns oldest first. The cursor rides in this index because db:verify §3
-- requires every *_id column to be indexed; it is never looked up on its own.
CREATE INDEX IF NOT EXISTS campaigns_open ON notifications.campaigns (created_at, last_member_id)
  WHERE status IN ('pending', 'running');
