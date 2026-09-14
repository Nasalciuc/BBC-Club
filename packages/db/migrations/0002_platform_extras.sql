-- Applied by scripts/migrate.ts after drizzle-kit's DDL. Things Drizzle cannot express.

-- 1) Monthly partitioning of the journal. drizzle-kit creates a plain table; convert it once, while empty.
--    Detach the bigserial sequence before DROP so LIKE's DEFAULT nextval(...) keeps working.
ALTER SEQUENCE platform.domain_events_id_seq OWNED BY NONE;
ALTER TABLE platform.domain_events RENAME TO domain_events_plain;
CREATE TABLE platform.domain_events (LIKE platform.domain_events_plain INCLUDING ALL) PARTITION BY RANGE (occurred_at);
DROP TABLE platform.domain_events_plain;
ALTER SEQUENCE platform.domain_events_id_seq OWNED BY platform.domain_events.id;

CREATE OR REPLACE FUNCTION platform.ensure_event_partitions(months_ahead int DEFAULT 2) RETURNS void AS $$
DECLARE m date; part text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    m := (date_trunc('month', now()) + (i || ' month')::interval)::date;
    part := 'domain_events_' || to_char(m, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='platform' AND c.relname=part) THEN
      EXECUTE format('CREATE TABLE platform.%I PARTITION OF platform.domain_events FOR VALUES FROM (%L) TO (%L)',
                     part, m, (m + interval '1 month'));
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
SELECT platform.ensure_event_partitions(3);   -- the `partitions` job keeps this rolling

-- 2) Retention: drop journal partitions older than 24 months (called by the `retention` job)
CREATE OR REPLACE FUNCTION platform.drop_old_event_partitions(keep_months int DEFAULT 24) RETURNS int AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
           WHERE ns.nspname='platform' AND c.relname ~ '^domain_events_[0-9]{4}_[0-9]{2}$'
             AND to_date(right(c.relname, 7), 'YYYY_MM') < date_trunc('month', now()) - (keep_months || ' month')::interval
  LOOP EXECUTE format('DROP TABLE platform.%I', r.relname); n := n + 1; END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;

-- 3) updated_at trigger function (attached per table by each module's migration)
CREATE OR REPLACE FUNCTION platform.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- 4) Fitness view: db:verify fails if this returns any row
CREATE OR REPLACE VIEW platform.cross_schema_fks AS
SELECT c.conname, n1.nspname AS from_schema, n2.nspname AS to_schema
FROM pg_constraint c
JOIN pg_class t1 ON c.conrelid = t1.oid JOIN pg_namespace n1 ON t1.relnamespace = n1.oid
JOIN pg_class t2 ON c.confrelid = t2.oid JOIN pg_namespace n2 ON t2.relnamespace = n2.oid
WHERE c.contype = 'f' AND n1.nspname <> n2.nspname;
