-- Expand-only: the airline a request was made for — its fare's carrier (catalog.fares.carrier, carrier_name) as it stood
-- when the member asked, recorded by the server from the fare when a request is made from a fare, never taken from the
-- app (ADR-IMPL-056). The 3.0 images name it: the request received shows the airline on the trip's card (08), the
-- request's detail reads `JFK → LHR · British Airways · 1 adult` (11). Null on a request made from an offer or as a
-- quote, on a fare that names no airline, when the fare could not be read in time, and on every request made before this
-- step. A later change to the fare never changes a request.
-- A named step, like 0029: requests.requests is created by 0005_requests.sql, after drizzle, so a column added through
-- a drizzle migration would fail on every fresh database. The drizzle snapshot is brought level by a no-op sync
-- migration (20261019*_snapshot_sync).
ALTER TABLE requests.requests
  ADD COLUMN IF NOT EXISTS carrier_at_request char(2),
  ADD COLUMN IF NOT EXISTS carrier_name_at_request text;

-- A code always comes with the name the member read (a fare may name its airline without a code, never the reverse),
-- and a name says something. Each side is true or false, never NULL: a CHECK passes when its expression is NULL (0025).
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock that writes do not wait for (0029).
ALTER TABLE requests.requests DROP CONSTRAINT IF EXISTS requests_carrier_at_request;
ALTER TABLE requests.requests
  ADD CONSTRAINT requests_carrier_at_request CHECK (
    (carrier_at_request IS NULL OR carrier_name_at_request IS NOT NULL)
    AND (carrier_name_at_request IS NULL OR length(btrim(carrier_name_at_request)) > 0)
  ) NOT VALID;
