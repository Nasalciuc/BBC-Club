import { and, gte, lt, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { anyText } from "@bbc/db/helpers";
import { notificationsTable } from "@bbc/db/schema/notifications";

/** The categories the daily cap counts: one offer push a day, personal or broadcast. */
export const OFFER_CATEGORIES = ["offers_personal", "offers_broadcast"] as const;

/** The offer pushes of `memberIds` scheduled in [`from`, `to`): one indexed read (`notif_offer_sends`, 0044). The
 *  categories are written into the statement, not bound, so the partial index's predicate holds for any plan; the
 *  members are one array (`= ANY($1::text[])`), so a page of one and a page of five hundred are one statement text. */
export function offerSendsSelect(exec: Executor, memberIds: readonly string[], from: Date, to: Date) {
  return exec
    .select({ memberId: notificationsTable.memberId, scheduledFor: notificationsTable.scheduledFor })
    .from(notificationsTable)
    .where(
      and(
        anyText(notificationsTable.memberId, memberIds),
        sql`${notificationsTable.category} IN ('offers_personal', 'offers_broadcast')`,
        gte(notificationsTable.scheduledFor, from),
        lt(notificationsTable.scheduledFor, to),
      ),
    );
}

/**
 * The daily cap: at most one offer push per member per day — the day it is sent, in the member's time zone. `sends` is
 * each member's send day as `sendTimes` gives it: the bounds of the local day this push would go out on (after quiet
 * hours, and not before its offer is published), read by Postgres in the member's zone. A member is capped when another
 * offer push of theirs, personal or broadcast and whatever its status, is scheduled within those bounds — whenever it
 * was created. One query for all of them, over the window that holds every such day; the comparison needs no other.
 */
export async function cappedOnSendDay(
  exec: Executor,
  sends: readonly { memberId: string; dayStart: Date; dayEnd: Date }[],
): Promise<Set<string>> {
  const capped = new Set<string>();
  if (sends.length === 0) return capped;
  let first = Infinity;
  let last = -Infinity;
  const dayOf = new Map<string, { start: number; end: number }>();
  for (const s of sends) {
    const start = s.dayStart.getTime();
    const end = s.dayEnd.getTime();
    first = Math.min(first, start);
    last = Math.max(last, end);
    dayOf.set(s.memberId, { start, end });
  }
  const rows = await offerSendsSelect(exec, [...dayOf.keys()], new Date(first), new Date(last));
  for (const r of rows) {
    const day = dayOf.get(r.memberId);
    const at = new Date(r.scheduledFor).getTime();
    if (day && at >= day.start && at < day.end) capped.add(r.memberId);
  }
  return capped;
}
