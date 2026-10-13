-- The site's destinations (ADR-IMPL-045): the cities the company's site sells, read each night from the site's own API
-- (weba.buybusinessclass.com) — each city's airports, its photo's address, and the US cities the site lists a price
-- from. A snapshot, replaced whole by the sync-site-destinations job; never an image, never a price shown to a member
-- from here (the pins are priced by the formula, ADR-IMPL-037). A named step in migrate.ts after the catalog schema
-- (0006): both tables reference catalog.airports. Recorded once in platform.extras_applied; the drizzle snapshot is
-- brought level by a no-op sync migration (20261012*_snapshot_sync). Expand-only: new tables nothing reads until this
-- release.

CREATE TABLE IF NOT EXISTS catalog.site_places (
  -- The site's own id for the city (its page is /flight/city/<name>/<id>).
  cms_id integer PRIMARY KEY,
  name text NOT NULL,
  -- The site's country and region, as the site names them.
  country text NOT NULL,
  region text NOT NULL,
  -- The city's main airport: the one its pin stands on.
  airport char(3) NOT NULL,
  -- Every airport the city's photo goes on, the main one included.
  airports char(3)[] NOT NULL,
  -- On the site's home page.
  promoted boolean DEFAULT false NOT NULL,
  -- `bestDeals/<id>/image/<file>` when the city's photo is its own and answers; null otherwise.
  image text,
  synced_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT site_places_airport_airports_code_fkey
    FOREIGN KEY (airport) REFERENCES catalog.airports (code) ON DELETE CASCADE,
  CONSTRAINT site_places_cms_id CHECK (cms_id > 0),
  CONSTRAINT site_places_main_airport CHECK (airport = ANY (airports)),
  CONSTRAINT site_places_image CHECK (
    image IS NULL OR image ~* '^bestDeals/[0-9]+/image/[a-z0-9._-]+\.(jpe?g|png|webp)$'
  )
);

CREATE TABLE IF NOT EXISTS catalog.site_routes (
  -- An airport of a US city the site lists for this destination (New York: JFK, EWR, LGA).
  route_from char(3) NOT NULL,
  cms_id integer NOT NULL,
  -- The site's own id for this price (one bestDeals entry of the city's page).
  deal integer NOT NULL,
  -- The site's "Price Today" and "Old Price", whole USD. Kept, not shown (ADR-IMPL-045).
  price integer NOT NULL,
  published_price integer,
  synced_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (route_from, cms_id),
  CONSTRAINT site_routes_route_from_airports_code_fkey
    FOREIGN KEY (route_from) REFERENCES catalog.airports (code) ON DELETE CASCADE,
  CONSTRAINT site_routes_cms_id_site_places_cms_id_fkey
    FOREIGN KEY (cms_id) REFERENCES catalog.site_places (cms_id) ON DELETE CASCADE,
  CONSTRAINT site_routes_deal CHECK (deal > 0),
  CONSTRAINT site_routes_price CHECK (price > 0),
  CONSTRAINT site_routes_published_price CHECK (published_price IS NULL OR published_price > 0)
);

-- Each foreign key's own column is indexed: the cascades look a removed airport's cities up by airport, and a removed
-- city's routes up by city (a route's airport leads its primary key).
CREATE INDEX IF NOT EXISTS site_places_airport ON catalog.site_places (airport);
CREATE INDEX IF NOT EXISTS site_routes_cms_id ON catalog.site_routes (cms_id);
