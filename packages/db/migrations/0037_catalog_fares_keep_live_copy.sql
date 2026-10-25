-- Which copy of a duplicate fare stays when the fares key is rebuilt (0034), chosen before 0034 runs (ADR-IMPL-061).
-- 0034 keeps the most recently updated copy, but expire-fares sets updated_at when it unpublishes a fare: the copy
-- that just expired looked newest, and the copy on sale was deleted. This step runs first (its block stands ahead of
-- 0034's in migrate.ts, and only while 0034 has not run): it leaves one copy per key, so 0034 deletes nothing.
-- 1. A blank carrier is no carrier. The import stores none as NULL (blankToNull); only a hand edit leaves '  ', which
--    0034's coalesce(carrier, '') would group with NULL but its constraint would not.
-- 2. Per key, exactly as 0034's constraint reads it (route, cabin, carrier with NULLs equal, valid_from, trip), the copy
--    that stays is the one on sale (published, still valid), then the most recently imported (created_at), then id.
--    A request that named a removed copy keeps its own copy of the price, carrier and published price (0029, 0030).

UPDATE catalog.fares SET carrier = NULL, updated_at = now() WHERE carrier IS NOT NULL AND btrim(carrier) = '';

-- destructive: removes only the duplicate copies 0034 would remove, keeping the one on sale instead of the last updated
DELETE FROM catalog.fares f
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY route_from, route_to, cabin, carrier, valid_from, trip
           ORDER BY (published AND valid_until > now()) DESC, created_at DESC, id DESC
         ) AS n
  FROM catalog.fares
) d
WHERE f.id = d.id AND d.n > 1;
