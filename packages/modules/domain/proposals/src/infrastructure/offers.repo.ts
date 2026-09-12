import { and, eq, gt, or, sql, isNull, desc, lt } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { offers, offerTargets } from "@bbc/db/schema/proposals";

/** Visibility rule, expressed once: an offer is visible to a member iff it is active, valid, and
 *  broadcast OR targeted at them OR in a segment they belong to. Everything else is 404 for them. */
function visibleTo(actorMemberId: string) {
  return and(
    eq(offers.status, "active"),
    gt(offers.validUntil, sql`now()`),
    or(
      eq(offers.targeting, "broadcast"),
      eq(offers.targetMemberId, actorMemberId),
      sql`EXISTS (SELECT 1 FROM ${offerTargets} t WHERE t.offer_id = ${offers.id} AND t.member_id = ${actorMemberId})`,
    ),
  );
}

export const offersRepo = {
  async feed(exec: Executor, actorMemberId: string, cursor: { ts: Date; id: string } | null, limit = 20) {
    return exec.select().from(offers)
      .where(and(visibleTo(actorMemberId), cursor ? or(lt(offers.publishAt, cursor.ts), and(eq(offers.publishAt, cursor.ts), lt(offers.id, cursor.id))) : undefined))
      .orderBy(desc(offers.publishAt), desc(offers.id))
      .limit(limit);
  },
  /** null → the route answers 404 (not 403): a member must not learn that someone else's offer exists. */
  async getVisible(exec: Executor, actorMemberId: string, offerId: string) {
    const [row] = await exec.select().from(offers).where(and(eq(offers.id, offerId), visibleTo(actorMemberId))).limit(1);
    return row ?? null;
  },
  /** system/operator only (route-guarded); no member scope by design */
  async getAny(exec: Executor, offerId: string) {
    const [row] = await exec.select().from(offers).where(eq(offers.id, offerId)).limit(1);
    return row ?? null;
  },
};
