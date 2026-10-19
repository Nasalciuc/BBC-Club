-- Expand-only: the member's photo, as Explore's greeting (02) and Profile (12) show it (ADR-IMPL-056) — the address of
-- an image hosted elsewhere, never the image, as catalog.place_photos keeps a city's (ADR-IMPL-043). Null, and the
-- member's initials shown, until they add one. No route sets it yet: an upload needs a native image picker and a new
-- build (ADR-IMPL-055 §7); this step only stores it and the profile reads it. It goes with the profile on
-- member.deleted.
-- A named step, like the other steps of ADR-IMPL-056, though members.profile comes from drizzle's own first migration
-- (20260914163714_sour_jamie_braddock): drizzle's migrations run before every named step, so this one finds the table
-- on a fresh database too, and it can validate its CHECK in a transaction of its own (0029), which drizzle's migrator,
-- one transaction for every pending migration, cannot. The drizzle snapshot is brought level by a no-op sync migration
-- (20261019*_snapshot_sync).
ALTER TABLE members.profile ADD COLUMN IF NOT EXISTS avatar_url text;

-- Only an https address: the app loads the photo over the network, and nothing else is a photo's address.
-- NOT VALID: the constraint holds every new write from this moment, without scanning the rows there are under the
-- table's lock; migrate.ts validates them next, in its own transaction, under a lock writes do not wait for (0029).
ALTER TABLE members.profile DROP CONSTRAINT IF EXISTS profile_avatar_url;
ALTER TABLE members.profile
  ADD CONSTRAINT profile_avatar_url CHECK (avatar_url IS NULL OR avatar_url ~ '^https://') NOT VALID;
