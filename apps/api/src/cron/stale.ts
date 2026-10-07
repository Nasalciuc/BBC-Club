/**
 * When a scheduled job counts as stale for /ready: one and a half of its own interval, never less than 36 h. A fixed
 * 36 h made the weekly db-report stale every Tuesday evening, so /ready turned red on every replica — new and old — and
 * blocked deploys until Monday. Intervals are read from the cron expression; anything unusual counts as daily. Only
 * jobs scheduled now count: a manual job, or one renamed or removed from the code, stays in the run history but must
 * never hold /ready red.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const STALE_FLOOR_MS = 36 * HOUR;

/** The longest gap between two runs a cron expression allows, approximately (minute hour day-of-month month weekday). */
export function cronIntervalMs(cron: string): number {
  const [minute = "*", hour = "*", dom = "*", month = "*", dow = "*"] = cron.trim().split(/\s+/);
  if (month !== "*") return 366 * DAY;
  if (dom !== "*") return 31 * DAY;
  if (dow !== "*") return 7 * DAY;
  const step = (field: string) => /^\*\/(\d+)$/.exec(field)?.[1];
  if (hour !== "*") return step(hour) ? Number(step(hour)) * HOUR : DAY;
  if (minute === "*") return MIN;
  return step(minute) ? Number(step(minute)) * MIN : HOUR;
}

export function staleAfterMs(cron: string): number {
  return Math.max(STALE_FLOOR_MS, 1.5 * cronIntervalMs(cron));
}

/** The scheduled jobs whose last run is older than their window. Runs of jobs not in the schedule are ignored. */
export function staleJobs(
  runs: Readonly<Record<string, { at: Date | string | null }>>,
  schedule: ReadonlyArray<{ name: string; cron: string }>,
  now = Date.now(),
): string[] {
  return schedule
    .filter(({ name, cron }) => {
      const at = runs[name]?.at;
      return at != null && now - new Date(at).getTime() > staleAfterMs(cron);
    })
    .map(({ name }) => name);
}
