-- Expand-only: partial indexes so /metrics stats() does not scan done deliveries.
-- CONCURRENTLY: applied outside a transaction by migrate.ts (one statement at a time).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deliveries_pending_created" ON "platform"."event_deliveries" ("created_at") WHERE "status" = 'pending';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deliveries_dead" ON "platform"."event_deliveries" ("id") WHERE "status" = 'dead';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deliveries_paused" ON "platform"."event_deliveries" ("id") WHERE "status" = 'paused';
