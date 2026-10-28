-- ADR-IMPL-075: the offers bump their generation (0045) in the statement that writes them — an ingest, a withdrawal,
-- the expire job, a segment's targets, a fix in psql — so Home and the feed can tell, before reading anything, that the
-- member's offers are what they were when the phone last asked (the ETag's fast path, apps/api http-cache.ts).
CREATE OR REPLACE TRIGGER offers_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON proposals.offers
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('proposals.offers');

CREATE OR REPLACE TRIGGER offer_targets_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON proposals.offer_targets
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('proposals.offers');

INSERT INTO platform.generations (key) VALUES ('proposals.offers') ON CONFLICT (key) DO NOTHING;
