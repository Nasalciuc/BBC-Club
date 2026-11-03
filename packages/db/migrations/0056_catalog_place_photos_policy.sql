-- ADR-IMPL-086: catalog.place_photos.policy, the rules a city's photo was chosen by. Every row now holds 1 (ADR-IMPL-043's
-- rules: a night view first, an original wider than 1280 px). The job treats a row under older rules than its own as due,
-- whatever its expiry, and its claim moves it to the current ones: the photos chosen before are chosen again at the
-- job's pace. A column only the new code writes, so what a worker still on the old code chooses during the deploy is
-- chosen again by the new one. A constant default: no table rewrite.
ALTER TABLE catalog.place_photos ADD COLUMN IF NOT EXISTS policy smallint NOT NULL DEFAULT 1;
ALTER TABLE catalog.place_photos ADD CONSTRAINT place_photos_policy CHECK (policy >= 1);
