-- Snapshot sync, no schema change (the member's own photo, 26 Oct 2026). The object this snapshot adds already exists
-- in every database: members.profile_photo (0043, ADR-IMPL-070). The named step in migrate.ts creates it, on fresh
-- databases too — it runs after drizzle's migrations, which create members.profile. This migration only brings
-- drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI fails if it proposes
-- anything.
SELECT 1;
