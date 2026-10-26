-- Landmarks (ADR-IMPL-064): for the city each airport serves, up to three landmarks with their photograph's address on
-- Wikimedia Commons and its credit — never the image — and a hold per outside source that asked the club to wait (a 429's
-- Retry-After), which both Wikimedia jobs honour. A named step in migrate.ts after the catalog schema (0006): the drizzle
-- migrator runs first and would not find catalog.airports. Recorded once in platform.extras_applied; the drizzle snapshot
-- is brought level by a no-op sync migration (20261025*_snapshot_sync). Expand-only: new tables nothing reads until this
-- release.

DO $$ BEGIN
  CREATE TYPE catalog.place_landmark_kind AS ENUM ('landmark', 'fewer', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog.outside_source AS ENUM ('wikidata', 'commons');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row per rank and place: a landmark at ranks 1 to 3, best first; `fewer` right after the last one found (rank 1
-- when none was) — the job looked and found fewer than three, and does not ask again for a month; `failed` (rank 1) — a
-- place never looked at successfully, tried again in six hours.
CREATE TABLE IF NOT EXISTS catalog.place_landmarks (
  -- The airport the app asks with.
  code char(3) NOT NULL,
  rank integer NOT NULL,
  kind catalog.place_landmark_kind NOT NULL,
  -- The city's Wikidata item; null only on a marker for a place whose city was not found.
  city_qid text,
  landmark_qid text,
  name text,
  -- The Commons file, its thumbnail's address and size, its licence and the credit line.
  file text,
  image_url text,
  width integer,
  height integer,
  licence text,
  licence_url text,
  credit text,
  fetched_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (code, rank),
  CONSTRAINT place_landmarks_code_airports_code_fkey
    FOREIGN KEY (code) REFERENCES catalog.airports (code) ON DELETE CASCADE,
  CONSTRAINT place_landmarks_rank CHECK (rank BETWEEN 1 AND 3),
  -- A landmark has everything the app shows; a marker has none of it.
  CONSTRAINT place_landmarks_landmark CHECK (
    kind <> 'landmark'
    OR (city_qid IS NOT NULL AND landmark_qid IS NOT NULL AND name IS NOT NULL AND file IS NOT NULL
        AND image_url IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND licence IS NOT NULL
        AND credit IS NOT NULL)
  ),
  CONSTRAINT place_landmarks_marker CHECK (
    kind = 'landmark'
    OR (landmark_qid IS NULL AND name IS NULL AND file IS NULL AND image_url IS NULL AND width IS NULL
        AND height IS NULL AND licence IS NULL AND licence_url IS NULL AND credit IS NULL)
  ),
  CONSTRAINT place_landmarks_failed CHECK (kind <> 'failed' OR rank = 1),
  CONSTRAINT place_landmarks_size CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  -- The app loads nothing over plain http.
  CONSTRAINT place_landmarks_https CHECK (
    (image_url IS NULL OR image_url LIKE 'https://%') AND (licence_url IS NULL OR licence_url LIKE 'https://%')
  ),
  CONSTRAINT place_landmarks_qids CHECK (
    (city_qid IS NULL OR city_qid ~ '^Q[1-9][0-9]*$') AND (landmark_qid IS NULL OR landmark_qid ~ '^Q[1-9][0-9]*$')
  ),
  CONSTRAINT place_landmarks_expiry CHECK (expires_at > fetched_at)
);

-- One marker a place at most.
CREATE UNIQUE INDEX IF NOT EXISTS place_landmarks_one_marker ON catalog.place_landmarks (code) WHERE kind <> 'landmark';

-- A source that answered 429: no Wikimedia job asks it anything before not_before (its Retry-After).
CREATE TABLE IF NOT EXISTS catalog.source_holds (
  source catalog.outside_source PRIMARY KEY,
  not_before timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
