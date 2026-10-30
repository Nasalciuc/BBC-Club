-- ADR-IMPL-077 (⚑A): Grafana's role reads, briefly, a few at a time — three connections at most, no statement past
-- 10 s, every transaction read-only — so a dashboard left open never weighs on the database. Settings of the role,
-- the cluster's like the role itself: written only when they differ, so another database migrating at the same moment
-- finds nothing to change.
DO $$
BEGIN
  IF (SELECT rolconnlimit FROM pg_roles WHERE rolname = 'bbc_monitor') IS DISTINCT FROM 3 THEN
    ALTER ROLE bbc_monitor CONNECTION LIMIT 3;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = 'bbc_monitor' AND s.setdatabase = 0
      AND s.setconfig @> ARRAY['statement_timeout=10s', 'default_transaction_read_only=on']
  ) THEN
    ALTER ROLE bbc_monitor SET statement_timeout = '10s';
    ALTER ROLE bbc_monitor SET default_transaction_read_only = on;
  END IF;
END
$$;
