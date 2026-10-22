-- A fare is one per route, cabin, carrier, valid_from and trip — and a fare without a carrier is one too.
-- 1. The trip (ADR-IMPL-056, 0031) is part of a fare's identity: one route sold one way and round trip in one file is
--    two fares. Under the old key the second row overwrote the first in place — the same id, another trip and price.
-- 2. NULLS NOT DISTINCT (Postgres 15+): the old unique index treated every NULL carrier as distinct, so the import's
--    ON CONFLICT never fired for a fare without one — three imports of one file were three rows, the stale price still
--    listed — against MODULE.md's "import idempotent".
-- A named step: catalog.fares comes from 0006_catalog.sql, after drizzle. The drizzle snapshot is brought level by a
-- no-op sync migration (20261022*_snapshot_sync). Idempotent: run again, it collapses nothing and rebuilds the key.

-- The duplicates the old key let in: per route, cabin, carrier (none counting as one), valid_from and trip, the most
-- recently updated row stays — the import's last word; the others go. A request that named a removed duplicate keeps
-- its own copy of the fare's price, carrier and published price (0029, 0030), but its fare_id is first remapped to
-- the row that stays: fare_id and replaces_fare_id are plain uuid columns with no foreign key, so nothing else
-- would stop them pointing at a fare that no longer exists.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY route_from, route_to, cabin, coalesce(carrier, ''), valid_from, trip
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS kept_id,
         row_number() OVER (
           PARTITION BY route_from, route_to, cabin, coalesce(carrier, ''), valid_from, trip
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS n
  FROM catalog.fares
)
UPDATE requests.requests r
SET fare_id = ranked.kept_id
FROM ranked
WHERE r.fare_id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY route_from, route_to, cabin, coalesce(carrier, ''), valid_from, trip
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS kept_id,
         row_number() OVER (
           PARTITION BY route_from, route_to, cabin, coalesce(carrier, ''), valid_from, trip
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS n
  FROM catalog.fares
)
UPDATE requests.requests r
SET replaces_fare_id = ranked.kept_id
FROM ranked
WHERE r.replaces_fare_id = ranked.id AND ranked.n > 1;

-- destructive: removes only the stale copies of a carrier-less fare that the old key could not see as one fare
DELETE FROM catalog.fares f
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY route_from, route_to, cabin, coalesce(carrier, ''), valid_from, trip
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS n
  FROM catalog.fares
) d
WHERE f.id = d.id AND d.n > 1;

-- The old key (0006 made it an index), replaced by a constraint of the same name: drizzle declares NULLS NOT DISTINCT
-- only on a unique constraint, and the import's ON CONFLICT names the same columns.
-- destructive: the key is rebuilt wider in the next statement, in the same transaction
DROP INDEX IF EXISTS catalog.fares_route_cabin_carrier;
ALTER TABLE catalog.fares DROP CONSTRAINT IF EXISTS fares_route_cabin_carrier;
ALTER TABLE catalog.fares
  ADD CONSTRAINT fares_route_cabin_carrier
  UNIQUE NULLS NOT DISTINCT (route_from, route_to, cabin, carrier, valid_from, trip);
