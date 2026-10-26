-- Idempotency for Kafka consumers. event_id is text: a journal id as a decimal string,
-- or topic:partition:offset for a search event. Applied by the extras glob.

CREATE TABLE IF NOT EXISTS platform.kafka_processed (
  consumer text NOT NULL,
  event_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
