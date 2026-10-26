import { and, eq, isNull, desc, lte, ne, or, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { notificationsTable as n } from "@bbc/db/schema/notifications";

/** What the inbox shows: the member's rows that reached them or are due — never a suppressed one (a withdrawn offer, a
 *  category the member turned off, a quote whose request moved on) nor a pending one still waiting for its time (quiet
 *  hours, an offer published later). A row past pending has had its time; a failed push stays: the inbox is the in-app
 *  record. */
const listed = (actorMemberId: string) =>
  and(
    eq(n.memberId, actorMemberId),
    ne(n.status, "suppressed"),
    or(ne(n.status, "pending"), lte(n.scheduledFor, sql`now()`)),
  );

export const notificationsRepo = {
  inboxSelect(exec: Executor, actorMemberId: string, limit = 30) {
    return exec.select().from(n).where(listed(actorMemberId)).orderBy(desc(n.createdAt)).limit(limit);
  },
  async inbox(exec: Executor, actorMemberId: string, limit = 30) {
    return this.inboxSelect(exec, actorMemberId, limit);
  },
  async unreadCount(exec: Executor, actorMemberId: string) {
    const [row] = await exec
      .select({ count: sql<number>`count(*)::int` })
      .from(n)
      .where(and(listed(actorMemberId), isNull(n.readAt)));
    return row?.count ?? 0;
  },
  /** UPDATE ... WHERE id AND member_id — returns 0 for someone else's row; the route maps 0 → 404. No SELECT-then-check. */
  async markRead(exec: Executor, actorMemberId: string, id: string): Promise<number> {
    const rows = await exec
      .update(n)
      .set({ readAt: sql`now()` })
      .where(and(eq(n.id, id), eq(n.memberId, actorMemberId), isNull(n.readAt)))
      .returning({ id: n.id });
    return rows.length;
  },
};
