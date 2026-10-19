-- Expand-only: two facts the catalogue now carries, both printed by the 3.0 images (ADR-IMPL-056).
-- 1. The trip a fare's price is for. 04 and 13 print `$3,900 round trip` beside a fare; a fare says round trip only
--    when the catalogue says so — the fares import's own `trip` column — and one way otherwise. Every fare there is
--    says one way, as each did until now (ADR-IMPL-055 §8): the default fills them.
-- 2. A destination's one line, under the city on its page (04: `Iconic sights, world-class culture and unforgettable
--    experiences.`), from the airports import's `description` column. Null, and the line left out, until it has one.
-- A named step: catalog.fares and catalog.airports are created by 0006_catalog.sql, after drizzle, so a column added
-- through a drizzle migration would fail on every fresh database. The drizzle snapshot is brought level by a no-op
-- sync migration (20261019*_snapshot_sync).

-- The trip is a state of the price: an enum (db:verify §7), its labels the ones EstimateVM.trip already uses.
DO $$ BEGIN
  CREATE TYPE catalog.fare_trip AS ENUM ('round_trip', 'one_way');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A constant default: Postgres keeps it in the catalog and rewrites no row, so the table's lock is held for a moment.
ALTER TABLE catalog.fares ADD COLUMN IF NOT EXISTS trip catalog.fare_trip NOT NULL DEFAULT 'one_way';

ALTER TABLE catalog.airports ADD COLUMN IF NOT EXISTS description text;

-- One line that says something: 1 to 160 characters once the spaces around it are left out.
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock writes do not wait for (0029).
ALTER TABLE catalog.airports DROP CONSTRAINT IF EXISTS airports_description;
ALTER TABLE catalog.airports
  ADD CONSTRAINT airports_description CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 160
  ) NOT VALID;
