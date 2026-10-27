-- ADR-IMPL-075: one counter per reference table. A trigger on the table bumps its counter in the transaction that writes
-- it, so every replica learns within a second that what it holds in memory changed — after a write from the app, a job
-- or psql alike. Each process reads the whole table at most once a second (platform/src/generations).
-- platform.bump_generation is platform's SQL API: the triggers of other schemas call it, never the table.
CREATE TABLE IF NOT EXISTS platform.generations (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generations_value_nonneg CHECK (value >= 0)
);

-- updated_at follows every write, from SQL too (0001's trigger, as on every table with the column).
CREATE OR REPLACE TRIGGER trg_updated_at
  BEFORE UPDATE ON platform.generations
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE OR REPLACE FUNCTION platform.bump_generation(k text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO platform.generations AS g (key, value) VALUES (k, 1)
  ON CONFLICT (key) DO UPDATE SET value = g.value + 1, updated_at = now();
$$;

-- A statement-level trigger: one bump per statement, whatever the number of rows it touched.
CREATE OR REPLACE FUNCTION platform.bump_generation_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM platform.bump_generation(TG_ARGV[0]);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER flags_generation
  AFTER INSERT OR UPDATE OR DELETE
  -- destructive: none — the event the trigger answers (a TRUNCATE also bumps); it truncates nothing
  OR TRUNCATE ON platform.flags
  FOR EACH STATEMENT EXECUTE FUNCTION platform.bump_generation_trigger('platform.flags');

INSERT INTO platform.generations (key) VALUES ('platform.flags') ON CONFLICT (key) DO NOTHING;
