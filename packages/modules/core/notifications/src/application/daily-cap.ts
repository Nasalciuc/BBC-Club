import { and, gte, lt, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { anyText } from "@bbc/db/helpers";
import { notificationsTable } from "@bbc/db/schema/notifications";
import { calendarDaysIn } from "../infrastructure/local-clock";
import { DEFAULT_TIME_ZONE, zonesForPostgres } from "./quiet-hours";

/** The categories the daily cap counts: one offer push a day, personal or broadcast. */
export const OFFER_CATEGORIES = ["offers_personal", "offers_broadcast"] as const;

/** The calendar day each instant falls on in its zone (`2026-10-26`), by Postgres's tzdata — the clock quiet hours read
 *  (#114); one statement for all of them. Each zone is read as `zonesForPostgres` reads it — the callers have logged a
 *  fallback already. */
export async function localDays(exec: Executor, at: readonly { at: Date; timeZone: string }[]): Promise<string[]> {
  if (at.length === 0) return [];
  const read = await zonesForPostgres(
    exec,
    at.map((a) => a.timeZone),
  );
  return calendarDaysIn(
    exec,
    at.map((a) => ({ at: a.at, zone: read.get(a.timeZone)?.zone ?? DEFAULT_TIME_ZONE })),
  );
}

/** Any send on the same local day as another is within a day and a DST hour of it; the window reaches further. */
const SAME_DAY_REACH_MS = 36 * 3_600_000;

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
 * each member's zone (`zonesForPostgres`'s answer) and when this push would go out (after quiet hours, and not before its
 * offer is published). A member is capped when another offer push of theirs, personal or broadcast and whatever its
 * status, is scheduled on that same local day — whenever it was created. One query for all of them, over the window that
 * holds every such day, then one for the days of the sends and of the pushes it found, by Postgres's tzdata as quiet
 * hours read it (`localDays`; none when it found no push).
 */
export async function cappedOnSendDay(
  exec: Executor,
  sends: readonly { memberId: string; timeZone: string; sendAt: Date }[],
): Promise<Set<string>> {
  const capped = new Set<string>();
  if (sends.length === 0) return capped;
  let first = Infinity;
  let last = -Infinity;
  const sendOf = new Map<string, { timeZone: string; sendAt: Date }>();
  for (const s of sends) {
    const t = s.sendAt.getTime();
    first = Math.min(first, t);
    last = Math.max(last, t);
    sendOf.set(s.memberId, { timeZone: s.timeZone, sendAt: s.sendAt });
  }
  const rows = await offerSendsSelect(
    exec,
    [...sendOf.keys()],
    new Date(first - SAME_DAY_REACH_MS),
    new Date(last + SAME_DAY_REACH_MS),
  );
  const found = rows.filter((r) => sendOf.has(r.memberId));
  if (found.length === 0) return capped;
  // The days of the sends that found a push and of those pushes, each in its member's zone: one statement.
  const pairs: { at: Date; timeZone: string }[] = [];
  const sendIndex = new Map<string, number>();
  const pushes: { memberId: string; index: number }[] = [];
  for (const r of found) {
    const s = sendOf.get(r.memberId);
    if (!s) continue;
    if (!sendIndex.has(r.memberId)) sendIndex.set(r.memberId, pairs.push({ at: s.sendAt, timeZone: s.timeZone }) - 1);
    pushes.push({
      memberId: r.memberId,
      index: pairs.push({ at: new Date(r.scheduledFor), timeZone: s.timeZone }) - 1,
    });
  }
  const days = await localDays(exec, pairs);
  for (const p of pushes) {
    const day = days[p.index];
    if (day !== undefined && day === days[sendIndex.get(p.memberId) ?? -1]) capped.add(p.memberId);
  }
  return capped;
}
