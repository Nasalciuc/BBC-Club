-- Place photos (ADR-IMPL-043): for the city each airport serves, the address of a photograph hosted elsewhere (Wikimedia
-- Commons through Wikidata, or Pexels) with its credit, or the point a satellite view is centred on — never the image.
-- A named step in migrate.ts after the catalog schema (0006): the drizzle migrator runs first and would not find
-- catalog.airports. Recorded once in platform.extras_applied; the drizzle snapshot is brought level by a no-op sync
-- migration (20261009*_snapshot_sync). Expand-only: a new table nothing reads until this release.

DO $$ BEGIN
  CREATE TYPE catalog.place_photo_status AS ENUM ('pending', 'photo', 'satellite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog.place_photo_source AS ENUM ('wikimedia', 'pexels', 'override');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS catalog.place_photos (
  code char(3) PRIMARY KEY,
  status catalog.place_photo_status DEFAULT 'pending' NOT NULL,
  source catalog.place_photo_source,
  card_url text,
  hero_url text,
  author text,
  license text,
  link text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  attempts integer DEFAULT 0 NOT NULL,
  resolved_at timestamptz,
  expires_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT place_photos_code_airports_code_fkey
    FOREIGN KEY (code) REFERENCES catalog.airports (code) ON DELETE CASCADE,
  -- A source exactly when there is a photo.
  CONSTRAINT place_photos_source CHECK ((status = 'photo') = (source IS NOT NULL)),
  -- A photo has both widths, and its own page unless an operator chose it.
  CONSTRAINT place_photos_photo CHECK (
    status <> 'photo' OR (card_url IS NOT NULL AND hero_url IS NOT NULL AND (link IS NOT NULL OR source = 'override'))
  ),
  -- A satellite view has a point on Earth.
  CONSTRAINT place_photos_satellite CHECK (
    status <> 'satellite'
    OR (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  ),
  -- The app loads nothing over plain http.
  CONSTRAINT place_photos_https CHECK (
    (card_url IS NULL OR card_url LIKE 'https://%')
    AND (hero_url IS NULL OR hero_url LIKE 'https://%')
    AND (link IS NULL OR link LIKE 'https://%')
  ),
  CONSTRAINT place_photos_attempts CHECK (attempts >= 0)
);

-- The job's question each minute: what is due.
CREATE INDEX IF NOT EXISTS place_photos_due ON catalog.place_photos (expires_at);
