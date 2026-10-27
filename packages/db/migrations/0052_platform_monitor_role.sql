-- ADR-IMPL-077 (⚑A): Grafana's read-only window on the database — `pg_monitor`'s statistics (pg_stat_statements, the
-- tables' and the indexes' counters), never a table's rows. The role cannot log in until a production deploy with
-- MONITORING=on gives it GRAFANA_PG_PASSWORD (deploy.sh, step 8): no password lives in a migration. Roles are the
-- cluster's, so this runs once per cluster and again harmlessly in every database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bbc_monitor') THEN
    CREATE ROLE bbc_monitor NOLOGIN;
  END IF;
END
$$;
GRANT pg_monitor TO bbc_monitor;
