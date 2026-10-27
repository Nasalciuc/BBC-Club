-- ADR-IMPL-075: the catalogue's reference tables bump their generation (0045) in the statement that writes them, so the
-- airports each replica holds and the fares and site pins it keeps for a minute are dropped within a second of an
-- import, the expire-fares job, the site's nightly sync or a hand fix in psql — on every replica, not only the process
-- that wrote. One counter for the airports, one for the fares, one for the site's places and routes. The site's prices
-- have none: a member's search stores one, and a bump per search would empty every replica's site pins all day; what
-- is kept from them lasts its minute, as before.
CREATE OR REPLACE TRIGGER airports_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON catalog.airports
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('catalog.airports');

CREATE OR REPLACE TRIGGER fares_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON catalog.fares
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('catalog.fares');

CREATE OR REPLACE TRIGGER site_places_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON catalog.site_places
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('catalog.site');

CREATE OR REPLACE TRIGGER site_routes_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON catalog.site_routes
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('catalog.site');

INSERT INTO platform.generations (key)
VALUES ('catalog.airports'), ('catalog.fares'), ('catalog.site')
ON CONFLICT (key) DO NOTHING;

-- "Popular from" and the hubs read the busiest airports first: the order as an index, so the top twelve are read, not
-- every airport sorted (3.15 ms → 0.06 ms, measured; ADR-IMPL-075).
CREATE INDEX IF NOT EXISTS airports_popularity ON catalog.airports (popularity DESC, code);
