-- Airport search (ADR-IMPL-036). A named step in migrate.ts, after the catalog schema exists (0006); recorded once in
-- platform.extras_applied. Not an *extras* file: those run before 0006 and would not find catalog.airports.
-- pg_trgm: typo tolerance ("Lodon" → London). unaccent: "Chișinău", "Zürich", "São Paulo" match their plain spellings.
-- Both are trusted extensions: the database owner creates them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Other names a member may type: metro and former codes (LON, KIV), the town the airport sits in. Search only.
ALTER TABLE catalog.airports ADD COLUMN IF NOT EXISTS search_terms text;

-- The search compares lower-case, accent-free text. It is computed once, when a row is written, by this trigger —
-- not on every row of every search (that cost 30–80 ms per query on 3,900 rows).
ALTER TABLE catalog.airports
  ADD COLUMN IF NOT EXISTS city_norm text,
  ADD COLUMN IF NOT EXISTS name_norm text,
  ADD COLUMN IF NOT EXISTS country_norm text,
  ADD COLUMN IF NOT EXISTS terms_norm text;

CREATE OR REPLACE FUNCTION catalog.airports_normalize() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.city_norm := unaccent(lower(NEW.city));
  NEW.name_norm := unaccent(lower(NEW.name));
  NEW.country_norm := unaccent(lower(NEW.country));
  NEW.terms_norm := unaccent(lower(coalesce(NEW.search_terms, '')));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS airports_normalize ON catalog.airports;
CREATE TRIGGER airports_normalize BEFORE INSERT OR UPDATE OF city, name, country, search_terms ON catalog.airports
  FOR EACH ROW EXECUTE FUNCTION catalog.airports_normalize();

-- Rows that existed before this step (the curated seed, a catalogue import): normalise them now.
UPDATE catalog.airports SET city = city;

CREATE INDEX IF NOT EXISTS airports_city_norm_trgm ON catalog.airports USING gin (city_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS airports_name_norm_trgm ON catalog.airports USING gin (name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS airports_terms_norm_trgm ON catalog.airports USING gin (terms_norm gin_trgm_ops);
