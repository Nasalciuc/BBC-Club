-- ADR-IMPL-077: every notification moves pending → sending → sent in a day, and the dispatch claims read the pending
-- ones: autovacuum after a fiftieth of the table changed, not a fifth (the default). No fillfactor: each move changes
-- `status`, an indexed column, so no free space on the page makes it HOT.
ALTER TABLE notifications.notifications SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
