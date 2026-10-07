-- Snapshot sync, no schema change (I1, 7 Oct 2026). The objects this snapshot adds already exist in every database:
-- platform.kafka_processed (0022), requests.intent, requests.replaces_fare_id with requests_replaces_fare and
-- requests_intent (0021), and catalog.airports.search_terms and the *_norm columns (0023). Those named steps in
-- migrate.ts create them, on fresh databases too. This migration only brings drizzle's snapshot level with the schema,
-- so that `drizzle-kit generate` stops proposing to recreate them; CI now fails if it proposes anything.
SELECT 1;
