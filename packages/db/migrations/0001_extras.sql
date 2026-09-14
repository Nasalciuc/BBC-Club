-- Applied by scripts/migrate.ts after drizzle-kit DDL.
-- drizzle rc: expressed in SQL; revert to the builder when 1.x is stable.

-- 1) Monthly partitioning. The bigserial sequence is OWNED BY the original column and would be dropped
--    with the table — detach it first, re-own it after the swap.
ALTER SEQUENCE platform.domain_events_id_seq OWNED BY NONE;
ALTER TABLE platform.domain_events RENAME TO domain_events_plain;
CREATE TABLE platform.domain_events (LIKE platform.domain_events_plain INCLUDING ALL)
  PARTITION BY RANGE (occurred_at);
DROP TABLE platform.domain_events_plain;
ALTER SEQUENCE platform.domain_events_id_seq OWNED BY platform.domain_events.id;

CREATE OR REPLACE FUNCTION platform.ensure_event_partitions(months_ahead int DEFAULT 2) RETURNS void AS $$
DECLARE m date; part text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    m := (date_trunc('month', now()) + (i || ' month')::interval)::date;
    part := 'domain_events_' || to_char(m, 'YYYY_MM');
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'platform' AND c.relname = part
    ) THEN
      EXECUTE format(
        'CREATE TABLE platform.%I PARTITION OF platform.domain_events FOR VALUES FROM (%L) TO (%L)',
        part, m, (m + interval '1 month')
      );
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
SELECT platform.ensure_event_partitions(3);

CREATE OR REPLACE FUNCTION platform.drop_old_event_partitions(keep_months int DEFAULT 24) RETURNS int AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'platform' AND c.relname ~ '^domain_events_[0-9]{4}_[0-9]{2}$'
      AND to_date(right(c.relname, 7), 'YYYY_MM')
        < date_trunc('month', now()) - (keep_months || ' month')::interval
  LOOP
    EXECUTE format('DROP TABLE platform.%I', r.relname);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;

-- 2) updated_at trigger on every table that has the column (all owned schemas)
CREATE OR REPLACE FUNCTION platform.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT table_schema, table_name FROM information_schema.columns
    WHERE column_name = 'updated_at'
      AND table_schema IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I.%I',
      r.table_schema, r.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at()',
      r.table_schema, r.table_name
    );
  END LOOP;
END $$;

-- 3) Indexes for reference columns (*_id) that drizzle-kit did not emit alone
CREATE INDEX IF NOT EXISTS deliveries_aggregate_id ON platform.event_deliveries (aggregate_id);
CREATE INDEX IF NOT EXISTS dlq_event_id ON platform.event_dlq (event_id);
CREATE INDEX IF NOT EXISTS responses_crm_activity ON engagement.offer_responses (crm_activity_id);
CREATE INDEX IF NOT EXISTS notif_source_event ON notifications.notifications (source_event_id);
CREATE INDEX IF NOT EXISTS notif_ticket ON notifications.notifications (ticket_id);
CREATE INDEX IF NOT EXISTS candidates_published_offer ON personalization.proposal_candidates (published_offer_id);
CREATE INDEX IF NOT EXISTS account_user_id ON auth.account (user_id);
CREATE INDEX IF NOT EXISTS account_account_id ON auth.account (account_id);
CREATE INDEX IF NOT EXISTS account_provider_id ON auth.account (provider_id);
CREATE INDEX IF NOT EXISTS session_user_id ON auth.session (user_id);

-- 4) created_at where verify requires a temporal birth column
ALTER TABLE crm.mirror ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE auth.rate_limit ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 5) Status-like text columns → enums (db:verify §7)
DO $$ BEGIN
  CREATE TYPE platform.job_run_status AS ENUM ('running', 'succeeded', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE platform.job_runs
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE platform.job_run_status USING status::platform.job_run_status,
  ALTER COLUMN status SET DEFAULT 'running'::platform.job_run_status;

DO $$ BEGIN
  CREATE TYPE platform.external_source AS ENUM ('crm', 'postmark', 'ses', 'push', 'expo', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE platform.external_inbox
  ALTER COLUMN source TYPE platform.external_source
  USING (
    CASE
      WHEN source IN ('crm', 'postmark', 'ses', 'push', 'expo') THEN source::platform.external_source
      ELSE 'unknown'::platform.external_source
    END
  );

-- 6) Fitness view: no FK may cross schemas
CREATE OR REPLACE VIEW platform.cross_schema_fks AS
SELECT c.conname, n1.nspname AS from_schema, n2.nspname AS to_schema
FROM pg_constraint c
JOIN pg_class t1 ON c.conrelid = t1.oid JOIN pg_namespace n1 ON t1.relnamespace = n1.oid
JOIN pg_class t2 ON c.confrelid = t2.oid JOIN pg_namespace n2 ON t2.relnamespace = n2.oid
WHERE c.contype = 'f' AND n1.nspname <> n2.nspname;
