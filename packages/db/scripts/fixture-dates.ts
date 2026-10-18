/** The fixture's dates against today's clock, for the seed (ADR-IMPL-047). */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An offer's validity as the seed writes it: the fixture's own while it still has a day to run, otherwise the same day
 * and time on the next year that does. The seed leaves `publish_at` to the database (`now()`), and CHECK
 * offers_valid_after_publish refuses a validity at or before it — the Paris offer ends on 31 Oct 2026, Tokyo on
 * 30 Nov 2026, and from those days on the whole seed would roll back (fresh databases and kept ones alike: Postgres
 * checks the CHECK before ON CONFLICT). A day of margin covers the clock of the seed against the database's.
 */
export function liveValidUntil(validUntil: string, now: Date): Date {
  const until = new Date(validUntil);
  if (Number.isNaN(until.getTime())) throw new Error(`fixture validUntil is not a date: ${validUntil}`);
  const floor = now.getTime() + DAY_MS;
  while (until.getTime() <= floor) until.setUTCFullYear(until.getUTCFullYear() + 1);
  return until;
}
