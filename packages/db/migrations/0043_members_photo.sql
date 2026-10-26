-- Expand-only: the photo the member adds themselves (ADR-IMPL-070, decision D9) — the image itself, in Postgres, which
-- is already backed up, private and cleared with the member; no object store and no public address. A still WebP,
-- 512 × 512, at most 100 KB, without metadata: the route checks it (`@bbc/shared/media/webp`) before it writes, and
-- the CHECKs below keep what Postgres can see of it. Read only by its member (GET /v1/profile/photo). One row per
-- member, which goes with the profile: member.deleted deletes the profile, and the FK deletes the photo with it.
-- A named step after drizzle's migrations, which make members.profile (20260914163714_sour_jamie_braddock) and run
-- before every named step; the drizzle snapshot is brought level by a no-op sync migration (20261026*_snapshot_sync).
-- Numbers 0038–0042 are taken by steps on other open branches.

CREATE TABLE IF NOT EXISTS members.profile_photo (
  member_id text PRIMARY KEY,
  image bytea NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT profile_photo_member_id_profile_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES members.profile (member_id) ON DELETE CASCADE,
  -- 1 B to 100 KB, and the size stored is the bytes' own.
  CONSTRAINT profile_photo_size CHECK (byte_size BETWEEN 1 AND 102400 AND octet_length(image) = byte_size),
  -- A WebP's container: RIFF … WEBP.
  CONSTRAINT profile_photo_webp CHECK (
    substring(image FROM 1 FOR 4) = 'RIFF'::bytea AND substring(image FROM 9 FOR 4) = 'WEBP'::bytea
  ),
  -- The tag is the bytes' own: an ETag can never describe another photo.
  CONSTRAINT profile_photo_sha256 CHECK (sha256 = encode(sha256(image), 'hex'))
);

-- A WebP is compressed already: Postgres keeps it out of line without trying to compress it again.
ALTER TABLE members.profile_photo ALTER COLUMN image SET STORAGE EXTERNAL;

-- updated_at follows every write, from SQL too (0001's trigger, as on every table with the column).
DROP TRIGGER IF EXISTS trg_updated_at ON members.profile_photo;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON members.profile_photo
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
