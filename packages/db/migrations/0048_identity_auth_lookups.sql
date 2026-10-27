-- ADR-IMPL-077: the lookups Better Auth makes on `auth`, each without an index until now. CONCURRENTLY: applied outside a
-- transaction by migrate.ts, so sign-ins keep being answered while they build. Plain indexes, never UNIQUE: Better Auth
-- may write two rows for one key at the same moment, and a unique index would turn that into a failed sign-in.
-- In SQL only: `schema/auth.ts` is Better Auth's generated file (re-generated on upgrades), and Drizzle never reads
-- the database's indexes back.
-- Every request to /api/auth/* reads its rate-limit row by key (storage "database").
CREATE INDEX CONCURRENTLY IF NOT EXISTS rate_limit_key ON auth.rate_limit (key);
-- A code's check reads the verification rows of an address (Better Auth's own advice).
CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_identifier ON auth.verification (identifier);
-- members' reconcile asks for the accounts created before a moment, newest first, every 15 minutes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_created_at ON auth."user" (created_at);
