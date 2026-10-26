-- The company's site as the club's indicative price source (ADR-IMPL-063): what the site's own search
-- (webapi.buybusinessclass.com/flights/search) answered for a route and trip — its figures, whole USD per person, or
-- that the company has no price there. Written by the search's one live call and by the refresh-site-prices job, never
-- on an error; read by the search, Home's site pins and a quote request (inside its transaction: no network there).
-- D6: a price older than 24 hours is never shown — the expiry CHECK holds it, and every read asks expires_at > now().
-- A named step in migrate.ts after the catalog schema (0006), like 0026 and 0028: the drizzle migrator runs first and
-- the type below lives in catalog. Recorded once in platform.extras_applied; the drizzle snapshot is brought level by a
-- no-op sync migration (20261025*_snapshot_sync). Expand-only: a new table nothing reads until this release, and
-- nothing reads it while catalog.site_prices is off.

DO $$ BEGIN
  CREATE TYPE catalog.site_price_status AS ENUM ('priced', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS catalog.site_prices (
  route_from char(3) NOT NULL,
  route_to char(3) NOT NULL,
  -- catalog.fare_trip (0031): the trip the figures are for.
  trip catalog.fare_trip NOT NULL,
  status catalog.site_price_status NOT NULL,
  -- The site's figures, whole USD per person; none on a `none` row. Premium economy is kept, never shown.
  business integer,
  first integer,
  premium_economy integer,
  fetched_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (route_from, route_to, trip),
  -- The site prices JFK → JFK; the club never asks, and never stores it.
  CONSTRAINT site_prices_route CHECK (route_from <> route_to),
  -- A priced row has its business figure; a `none` row has no figure at all.
  CONSTRAINT site_prices_status CHECK (
    (status = 'priced' AND business IS NOT NULL)
    OR (status = 'none' AND business IS NULL AND first IS NULL AND premium_economy IS NULL)
  ),
  CONSTRAINT site_prices_amounts CHECK (
    (business IS NULL OR business > 0) AND (first IS NULL OR first > 0) AND (premium_economy IS NULL OR premium_economy > 0)
  ),
  -- D6: shown for at most 24 hours after the site answered.
  CONSTRAINT site_prices_expiry CHECK (expires_at > fetched_at AND expires_at <= fetched_at + interval '24 hours')
);

-- The job's questions: what is due for a refresh (expires within six hours: asked 18 or more hours ago), and what has
-- expired.
CREATE INDEX IF NOT EXISTS site_prices_due ON catalog.site_prices (expires_at);
