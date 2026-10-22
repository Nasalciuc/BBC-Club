/** The fixture's dates against today's clock, for the seed (ADR-IMPL-047). */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An offer's validity as the seed writes it: the fixture's own while it still has a day to run, otherwise the same day
 * and time on the next year that does. The seed leaves `publish_at` to the database (`now()`), and CHECK
 * offers_valid_after_publish refuses a validity at or before it — the Paris offer ends on 31 Oct 2026, Tokyo on
 * 30 Nov 2026, and from those days on the whole seed would roll back (fresh databases and kept ones alike: Postgres
 * checks the CHECK before ON CONFLICT). A day of margin covers the clock of the seed against the database's.
 *
 * Every candidate year is taken from the fixture's own date, its day clamped to that month's length: 29 February lands
 * on 28 February in a year without one and back on the 29th in a leap year. setUTCFullYear alone would roll it into
 * 1 March and keep it there.
 */
export function liveValidUntil(validUntil: string, now: Date): Date {
  const original = new Date(validUntil);
  if (Number.isNaN(original.getTime())) throw new Error(`fixture validUntil is not a date: ${validUntil}`);
  const floor = now.getTime() + DAY_MS;
  for (let k = 0; ; k++) {
    const until = sameDayIn(original, original.getUTCFullYear() + k);
    if (until.getTime() > floor) return until;
  }
}

/** The same month, day and time of day in `year`; a day the month does not have becomes its last. */
function sameDayIn(date: Date, year: number): Date {
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const at = new Date(date.getTime());
  at.setUTCFullYear(year, month, Math.min(date.getUTCDate(), lastDay));
  return at;
}
