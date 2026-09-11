-- Things Drizzle cannot express; applied after drizzle-kit's generated DDL for 0001.

-- 1) updated_at trigger on every table that has the column (raw SQL cannot bypass it)
CREATE OR REPLACE FUNCTION platform.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT table_schema, table_name FROM information_schema.columns
           WHERE column_name = 'updated_at' AND table_schema IN ('members','proposals','engagement')
  LOOP EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at()', r.table_schema, r.table_name);
  END LOOP; END $$;

-- 2) monthly partitioning of the journal (declarative; pg_partman or a cron creates future partitions)
--    drizzle-kit created platform.domain_events as a plain table; we recreate it partitioned in 0001.
--    (see migrations/0001_partition_domain_events.sql — runs BEFORE any insert)

-- 3) fitness function used by `bun run db:verify`: no FK may cross schemas
CREATE OR REPLACE VIEW platform.cross_schema_fks AS
SELECT c.conname, n1.nspname AS from_schema, n2.nspname AS to_schema
FROM pg_constraint c
JOIN pg_class t1 ON c.conrelid = t1.oid JOIN pg_namespace n1 ON t1.relnamespace = n1.oid
JOIN pg_class t2 ON c.confrelid = t2.oid JOIN pg_namespace n2 ON t2.relnamespace = n2.oid
WHERE c.contype = 'f' AND n1.nspname <> n2.nspname;
-- db:verify fails if: SELECT count(*) FROM platform.cross_schema_fks; > 0

-- 4) least-privilege roles (month 2): one role per module with USAGE on its own schema only
-- CREATE ROLE mod_proposals; GRANT USAGE ON SCHEMA proposals TO mod_proposals; ...
