-- catalog schema: fares + airports (THE BUILD §5.1). Expand-only; idempotent via extras_applied.

CREATE SCHEMA IF NOT EXISTS catalog;

DO $$ BEGIN
  CREATE TYPE catalog.fare_cabin AS ENUM ('business', 'first');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog.fare_source AS ENUM ('manual', 'import', 'gds');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS catalog.fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  route_from char(3) NOT NULL,
  route_to char(3) NOT NULL,
  cabin catalog.fare_cabin NOT NULL,
  carrier char(2),
  carrier_name text,
  product text,
  nonstop boolean DEFAULT true NOT NULL,
  duration_minutes integer,
  depart_at timestamptz,
  arrive_at timestamptz,
  price numeric(10, 2) NOT NULL,
  published_price numeric(10, 2),
  published_source text,
  currency char(3) DEFAULT 'USD' NOT NULL,
  source catalog.fare_source DEFAULT 'import' NOT NULL,
  valid_from timestamptz DEFAULT now() NOT NULL,
  valid_until timestamptz NOT NULL,
  published boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT fares_price_pos CHECK (price > 0),
  CONSTRAINT fares_published_gte_price CHECK (published_price IS NULL OR published_price >= price),
  CONSTRAINT fares_valid_range CHECK (valid_until > valid_from),
  CONSTRAINT fares_iata CHECK (length(route_from) = 3 AND length(route_to) = 3 AND route_from <> route_to),
  CONSTRAINT fares_published_has_source CHECK (published_price IS NULL OR published_source IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS fares_route_cabin_carrier
  ON catalog.fares (route_from, route_to, cabin, carrier, valid_from);
CREATE INDEX IF NOT EXISTS fares_search
  ON catalog.fares (route_from, route_to, cabin) WHERE published = true;
CREATE INDEX IF NOT EXISTS fares_expiry
  ON catalog.fares (valid_until) WHERE published = true;
CREATE INDEX IF NOT EXISTS fares_destinations
  ON catalog.fares (route_to) WHERE published = true;

CREATE TABLE IF NOT EXISTS catalog.airports (
  code char(3) PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  country_code char(2) NOT NULL,
  region text NOT NULL,
  lat numeric(9, 6) NOT NULL,
  lng numeric(9, 6) NOT NULL,
  popularity integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS airports_city ON catalog.airports (city);
CREATE INDEX IF NOT EXISTS airports_region ON catalog.airports (region);

-- updated_at trigger (same as other owned tables)
DO $$ BEGIN
  CREATE TRIGGER fares_set_updated_at
    BEFORE UPDATE ON catalog.fares
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
