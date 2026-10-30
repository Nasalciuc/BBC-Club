-- ADR-IMPL-077: the queue and the logs of platform change most of their rows every day; autovacuum's default (a fifth
-- of the table) waits too long on them, and their dead rows slow the claims. A fiftieth instead, for each of vacuum,
-- vacuum after inserts and analyze. No fillfactor: their updates change indexed columns (`status`), which no free
-- space on the page can make HOT.
ALTER TABLE platform.event_deliveries SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE platform.job_runs SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE platform.rate_limit_state SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
