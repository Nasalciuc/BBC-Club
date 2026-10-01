-- Same table as the drizzle folder 20261001110827_typical_madame_masque.
-- The extras glob applies this after drizzle migrate(); IF NOT EXISTS makes the second create a no-op.
-- There is no dedicated migrate.ts block.

CREATE SCHEMA IF NOT EXISTS catalog;

DO $$ BEGIN
  CREATE TYPE catalog.fare_cabin AS ENUM('business', 'first');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS catalog.demand_daily (
  day timestamptz NOT NULL,
  route_from char(3) NOT NULL,
  route_to char(3) NOT NULL,
  cabin catalog.fare_cabin NOT NULL,
  searches integer NOT NULL,
  searches_without_fare integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demand_daily_pkey PRIMARY KEY (day, route_from, route_to, cabin),
  CONSTRAINT demand_daily_counts_nonneg CHECK (searches >= 0 AND searches_without_fare >= 0),
  CONSTRAINT demand_daily_nofare_lte CHECK (searches_without_fare <= searches)
);
