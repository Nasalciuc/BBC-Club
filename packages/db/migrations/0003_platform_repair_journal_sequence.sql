-- Repairs databases migrated before 0001_extras.sql kept the sequence alive. Safe on fresh databases.
CREATE SEQUENCE IF NOT EXISTS platform.domain_events_id_seq AS bigint;
SELECT setval(
  'platform.domain_events_id_seq',
  COALESCE((SELECT max(id) FROM platform.domain_events), 0) + 1,
  false
);
ALTER TABLE platform.domain_events ALTER COLUMN id SET DEFAULT nextval('platform.domain_events_id_seq');
ALTER SEQUENCE platform.domain_events_id_seq OWNED BY platform.domain_events.id;

-- event_id / delivery_id are references, not generated ids. A bigserial default masks a missing insert.
-- Safe when the columns already have no default / the sequences are already gone.
ALTER TABLE platform.event_deliveries ALTER COLUMN event_id DROP DEFAULT;
DROP SEQUENCE IF EXISTS platform.event_deliveries_event_id_seq;
ALTER TABLE platform.event_dlq ALTER COLUMN delivery_id DROP DEFAULT;
ALTER TABLE platform.event_dlq ALTER COLUMN event_id DROP DEFAULT;
DROP SEQUENCE IF EXISTS platform.event_dlq_delivery_id_seq;
DROP SEQUENCE IF EXISTS platform.event_dlq_event_id_seq;
