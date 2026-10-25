# ADR-IMPL-061 — The fares key keeps the copy on sale; a migration that would stop half-way does not start

Status: proposed · Date: 2026-10-25 · Scope: `packages/db` (new step 0037 and its named block, a preflight in
`scripts/migrate.ts`), `infra/RUNBOOK.md` · Amends ADR-IMPL-059 point 4 (which copy of a duplicate fare stays);
0034's file is not edited.

**Context.**

- **0034 can keep the wrong copy.** It rebuilt the fares key and deleted the duplicates the old key had let in. Of
  each duplicate it kept the copy with the newest `updated_at`. But `expire-fares` sets `updated_at = now()` when it
  unpublishes a fare (`fares.repo.ts`), so the copy that had just expired looked newest. On a database with such
  duplicates, 0034 deleted the fare on sale and kept the expired one: the route showed no fare.
- **Blank and none.** 0034's dedupe grouped by `coalesce(carrier, '')`, so a blank carrier counted as no carrier. Its
  constraint (`UNIQUE NULLS NOT DISTINCT`) treats them as different keys. The import never stores a blank carrier
  (`blankToNull`); only a hand edit could leave one.
- **A half-done migration.** A stored airport off the globe let 0034 commit, then stopped 0035's
  `VALIDATE CONSTRAINT airports_coordinates`. 0036 never ran.
- **Both states exist.** 0034 is on `main`. Staging may have run it; production may not. A step that already ran
  cannot be edited.

**Decision.**

1. **A new step, 0037 (`0037_catalog_fares_keep_live_copy.sql`), chooses before 0034.** Its block stands ahead of
   0034's in `migrate.ts` and runs its SQL only while 0034 has not run. It does two things:
   - turns a blank carrier into none;
   - deletes duplicates per key, grouped exactly as the constraint groups them (`PARTITION BY` route, cabin, carrier
     with NULLs equal, `valid_from`, trip). The copy that stays is the one on sale (`published` and `valid_until` in
     the future), then the most recently imported (`created_at`), then `id`.

   0034 then finds one copy per key and deletes nothing. On a database that already ran 0034, 0037 is only recorded:
   the key already holds, and there is nothing left to choose between.

2. **A preflight in `migrate.ts`.** Before any step runs (Drizzle's included), it looks for what would stop a
   pending step half-way and refuses the whole run with one line per row, changing nothing. Today that is an airport
   off the globe while 0035 is pending. The check only reads.
3. **0034's file stays as it is.** Its block still runs only once (the ledger), so the `DROP INDEX` it cannot repeat
   never runs twice.

**Consequences.**

- On a database that has not run 0034 (production, if the owner's query confirms it), the fares on sale survive the
  key's rebuild.
- On a database that already ran 0034 (staging, if confirmed), a route may have lost its live copy to an expired one.
  Nothing can tell which: the deleted rows are gone. A new import of the catalogue repairs it, because the import
  upserts on the key and republishes the row (RUNBOOK, "A database that ran 0034 before 0037").
- A migration with an airport off the globe now stops before 0034, with the airport's code, instead of after it.
- Requests that named a removed copy keep their own price, carrier and published price (0029, 0030), as before.

**Left to the owner.** Run on staging and on production, before the deploy that carries 0037:
`SELECT name, applied_at FROM platform.extras_applied WHERE name LIKE '003%' ORDER BY 1;`. If 0034 is listed, that
database ran it: re-import the catalogue after the deploy. The pre-deploy check that must return no rows:
`SELECT code FROM catalog.airports WHERE NOT (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);`.
