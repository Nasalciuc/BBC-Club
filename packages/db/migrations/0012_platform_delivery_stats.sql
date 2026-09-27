-- Expand-only: partial indexes so /metrics stats() does not scan done deliveries.
CREATE INDEX IF NOT EXISTS "deliveries_pending_created" ON "platform"."event_deliveries" ("created_at") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "deliveries_dead" ON "platform"."event_deliveries" ("id") WHERE "status" = 'dead';
CREATE INDEX IF NOT EXISTS "deliveries_paused" ON "platform"."event_deliveries" ("id") WHERE "status" = 'paused';
