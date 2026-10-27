import { and, gte, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { notificationsTable } from "@bbc/db/schema/notifications";
import { zoneClock } from "@bbc/shared/time-zone";

/** The categories the daily cap counts: one offer push a day, personal or broadcast. */
export const OFFER_CATEGORIES = ["offers_personal", "offers_broadcast"] as const;

/** The calendar day `at` falls on in `timeZone` (`2026-10-26`), by the same clock quiet hours read (shared/time-zone,
 *  one formatter per zone). The zone must be one (`safeTimeZone`'s answer). */
export function localDay(at: Date, timeZone: string): string {
  const t = zoneClock(at, timeZone);
  return `${t.year}-${t.month}-${t.day}`;
}

/** Any send on the same local day as another is within a day and a DST hour of it; the window reaches further. */
const SAME_DAY_REACH_MS = 36 * 3_600_000;

/** The offer pushes of `memberIds` scheduled in [`from`, `to`): one indexed read (`notif_offer_sends`, 0044). The
 *  categories are written into the statement, not bound, so the partial index's predicate holds for any plan. */
export function offerSendsSelect(exec: Executor, memberIds: readonly string[], from: Date, to: Date) {
  return exec
    .select({ memberId: notificationsTable.memberId, scheduledFor: notificationsTable.scheduledFor })
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.memberId, [...memberIds]),
        sql`${notificationsTable.category} IN ('offers_personal', 'offers_broadcast')`,
        gte(notificationsTable.scheduledFor, from),
        lt(notificationsTable.scheduledFor, to),
      ),
    );
}

/**
 * The daily cap: at most one offer push per member per day — the day it is sent, in the member's time zone. `sends` is
 * each member's zone (`safeTimeZone`'s answer) and when this push would go out (after quiet hours, and not before its
 * offer is published). A member is capped when another offer push of theirs, personal or broadcast and whatever its
 * status, is scheduled on that same local day — whenever it was created. One query for all of them, over the window that
 * holds every such day; the day itself is compared here, with the Intl data quiet hours use (a zone Postgres might not
 * know never fails the read).
 */
export async function cappedOnSendDay(
  exec: Executor,
  sends: readonly { memberId: string; timeZone: string; sendAt: Date }[],
): Promise<Set<string>> {
  const capped = new Set<string>();
  if (sends.length === 0) return capped;
  let first = Infinity;
  let last = -Infinity;
  const sendDay = new Map<string, { timeZone: string; day: string }>();
  // A page shares its `now`: one day per zone and send time, not one per member.
  const days = new Map<string, string>();
  for (const s of sends) {
    const t = s.sendAt.getTime();
    first = Math.min(first, t);
    last = Math.max(last, t);
    const k = `${s.timeZone}|${t}`;
    let day = days.get(k);
    if (day === undefined) days.set(k, (day = localDay(s.sendAt, s.timeZone)));
    sendDay.set(s.memberId, { timeZone: s.timeZone, day });
  }
  const rows = await offerSendsSelect(
    exec,
    [...sendDay.keys()],
    new Date(first - SAME_DAY_REACH_MS),
    new Date(last + SAME_DAY_REACH_MS),
  );
  for (const r of rows) {
    const s = sendDay.get(r.memberId);
    if (s && !capped.has(r.memberId) && localDay(new Date(r.scheduledFor), s.timeZone) === s.day) {
      capped.add(r.memberId);
    }
  }
  return capped;
}
