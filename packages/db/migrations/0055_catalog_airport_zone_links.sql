-- ADR-IMPL-077 §5 (#114): tzdata 2024b made Asia/Choibalsan a link to Asia/Ulaanbaatar (one clock since 2008), and a
-- Postgres without tzdata-legacy (postgres:16, production's base image) no longer reads the old name: every dated search
-- from Choibalsan (COQ) would fail on `AT TIME ZONE`. The reference (seeds/airports-reference.tsv) now writes the zone it
-- links to; the reference never touches a row it inserted before (ADR-IMPL-036), so this moves that row.
UPDATE catalog.airports SET tz = 'Asia/Ulaanbaatar' WHERE tz = 'Asia/Choibalsan';
