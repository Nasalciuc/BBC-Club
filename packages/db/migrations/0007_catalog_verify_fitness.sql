-- Expand-only fitness fixes for db:verify (catalog).
-- Idempotent: safe on DBs that already applied 0006.

-- catalog.airports: created_at (AGENTS.md / verify §5)
ALTER TABLE catalog.airports
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- catalog.fares: trigger must be named trg_updated_at (verify §6)
DROP TRIGGER IF EXISTS fares_set_updated_at ON catalog.fares;
DROP TRIGGER IF EXISTS trg_updated_at ON catalog.fares;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON catalog.fares
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
