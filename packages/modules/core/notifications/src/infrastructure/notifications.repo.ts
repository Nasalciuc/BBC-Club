import { and, eq, isNull, desc, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { notificationsTable as n } from "@bbc/db/schema/notifications";

export const notificationsRepo = {
  async inbox(exec: Executor, actorMemberId: string, limit = 30) {
    return exec.select().from(n).where(eq(n.memberId, actorMemberId)).orderBy(desc(n.createdAt)).limit(limit);
  },
  async unreadCount(exec: Executor, actorMemberId: string) {
    const [{ count }] = await exec
      .select({ count: sql<number>`count(*)::int` })
      .from(n)
      .where(and(eq(n.memberId, actorMemberId), isNull(n.readAt)));
    return count;
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
