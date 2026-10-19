-- Snapshot sync, no schema change (ADR-IMPL-056, 19 Oct 2026). The objects this snapshot adds already exist in every
-- database: members.profile.avatar_url and the profile_avatar_url CHECK (0033). The named step in migrate.ts creates
-- them, on fresh databases too — it runs after drizzle's first migration, which creates members.profile. This
-- migration only brings drizzle's snapshot level with the schema, so that `drizzle-kit generate` proposes nothing; CI
-- fails if it proposes anything.
SELECT 1;
