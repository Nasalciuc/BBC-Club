-- Two rules the catalogue import now holds (g4), kept by the tables too, so nothing written past the import breaks
-- what the app shows.
-- 1. A fare's duration is whole minutes above zero, or none. FareVM requires a positive duration: one fare at 0
--    minutes made its route's whole SearchResultVM fail to parse in the app ("Something went wrong", and Try again
--    never succeeded). A duration of 0 or less already stored is no duration: the fare row shows none.
-- 2. An airport stands on the globe: latitude from -90 to 90, longitude from -180 to 180 (an import stored 999 / 500).
--    No row is changed for it: an airport off the globe has no right place to move to, so the VALIDATE in migrate.ts
--    refuses to finish while one is there — re-import it with its real coordinates, then run the migration again.
-- A named step: catalog.fares and catalog.airports come from 0006_catalog.sql, after drizzle. The drizzle snapshot is
-- brought level by a no-op sync migration (20261022*_snapshot_sync). Idempotent.

UPDATE catalog.fares SET duration_minutes = NULL, updated_at = now() WHERE duration_minutes <= 0;

-- NOT VALID: each constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock writes do not wait for (0029).
ALTER TABLE catalog.fares DROP CONSTRAINT IF EXISTS fares_duration_pos;
ALTER TABLE catalog.fares
  ADD CONSTRAINT fares_duration_pos CHECK (duration_minutes IS NULL OR duration_minutes > 0) NOT VALID;

ALTER TABLE catalog.airports DROP CONSTRAINT IF EXISTS airports_coordinates;
ALTER TABLE catalog.airports
  ADD CONSTRAINT airports_coordinates CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180) NOT VALID;
