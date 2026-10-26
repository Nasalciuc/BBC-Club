-- The site's deals are shown for at most a day after the site was read (ADR-IMPL-067, D6): catalog.site_routes — the
-- nightly snapshot of the prices the company's site lists from US cities — gains valid_until, the moment a row stops
-- being served. The sync writes it as the read's time + 24 hours (synced_at, the transaction's now(), + 24 h); every
-- read asks valid_until > now(). A deal the site drops goes with the next sync's replace; a sync that fails leaves the
-- rows it kept to expire within the day.
-- A named step in migrate.ts after 0028 (which creates the table). Recorded once in platform.extras_applied; the drizzle
-- snapshot is brought level by a no-op sync migration (20261025*_snapshot_sync). Re-runnable statement by statement.
-- Expand-only: a new column with a default, so a binary from before this release still writes a valid row.

ALTER TABLE catalog.site_routes ADD COLUMN IF NOT EXISTS valid_until timestamptz;

-- The rows there are: their own read + 24 hours. A row read more than a day ago is expired at once, and the next sync
-- writes it again. Not a constant default: ADD COLUMN … DEFAULT would give every row the migration's own day.
UPDATE catalog.site_routes SET valid_until = synced_at + interval '24 hours' WHERE valid_until IS NULL;

ALTER TABLE catalog.site_routes ALTER COLUMN valid_until SET DEFAULT (now() + interval '24 hours');
ALTER TABLE catalog.site_routes ALTER COLUMN valid_until SET NOT NULL;

-- D6 in Postgres: after the read, and at most 24 hours after it.
DO $$ BEGIN
  ALTER TABLE catalog.site_routes ADD CONSTRAINT site_routes_validity
    CHECK (valid_until > synced_at AND valid_until <= synced_at + interval '24 hours');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
