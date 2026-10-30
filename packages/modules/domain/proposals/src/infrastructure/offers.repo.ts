import { and, eq, gt, lte, or, sql, isNull, desc, lt, type Placeholder } from "drizzle-orm";
import { eqConst } from "@bbc/db/helpers";
import type { Executor } from "@bbc/db";
import { statement } from "@bbc/db/statements";
import { offers, offerTargets } from "@bbc/db/schema/proposals";

/** Visibility rule, expressed once: an offer is visible to a member iff it is active, published (its publish_at has
 *  come: a later one is a schedule), valid, and broadcast OR targeted at them OR in a segment they belong to.
 *  Everything else is 404 for them. */
function visibleTo(actorMemberId: string | Placeholder) {
  return and(
    eqConst(offers.status, "active"),
    lte(offers.publishAt, sql`now()`),
    gt(offers.validUntil, sql`now()`),
    meantFor(actorMemberId),
  );
}

/** Whom the offer is for: everyone, the member by name, or a segment they are in. */
function meantFor(actorMemberId: string | Placeholder) {
  return or(
    eq(offers.targeting, "broadcast"),
    eq(offers.targetMemberId, actorMemberId),
    sql`EXISTS (SELECT 1 FROM ${offerTargets} t WHERE t.offer_id = ${offers.id} AND t.member_id = ${actorMemberId})`,
  );
}

/** The feed's first page and the verdict's read — Home, the feed, an offer's page — built once per executor
 *  (ADR-IMPL-074). A later page (a cursor) is built in place. */
const firstPage = statement("proposals_feed", (e) =>
  e
    .select()
    .from(offers)
    .where(visibleTo(sql.placeholder("member")))
    .orderBy(desc(offers.publishAt), desc(offers.id))
    .limit(sql.placeholder("limit")),
);
const verdictRead = statement("proposals_verdict", (e) =>
  e
    .select({
      offer: offers,
      visible: sql<boolean>`coalesce(${visibleTo(sql.placeholder("member"))}, false)`,
      meant: sql<boolean>`coalesce(${meantFor(sql.placeholder("member"))}, false)`,
      lapsed: sql<boolean>`${offers.validUntil} <= now()`,
    })
    .from(offers)
    .where(eq(offers.id, sql.placeholder("id")))
    .limit(1),
);

export const offersRepo = {
  async feed(exec: Executor, actorMemberId: string, cursor: { ts: Date; id: string } | null, limit = 20) {
    if (!cursor) return firstPage(exec, { member: actorMemberId, limit });
    return exec
      .select()
      .from(offers)
      .where(
        and(
          visibleTo(actorMemberId),
          cursor
            ? or(lt(offers.publishAt, cursor.ts), and(eq(offers.publishAt, cursor.ts), lt(offers.id, cursor.id)))
            : undefined,
        ),
      )
      .orderBy(desc(offers.publishAt), desc(offers.id))
      .limit(limit);
  },
  /** null → the route answers 404 (not 403): a member must not learn that someone else's offer exists. */
  async getVisible(exec: Executor, actorMemberId: string, offerId: string) {
    const [row] = await exec
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), visibleTo(actorMemberId)))
      .limit(1);
    return row ?? null;
  },
  /** The offer by key, with whether it is visible to the member now, whether it was meant for them, and whether its
   *  validity has passed — one read, for `verdict` (ADR-IMPL-075). */
  async withVerdict(exec: Executor, actorMemberId: string, offerId: string) {
    const [row] = await verdictRead(exec, { member: actorMemberId, id: offerId });
    return row ?? null;
  },
  /** system/operator only (route-guarded); no member scope by design */
  async getAny(exec: Executor, offerId: string) {
    const [row] = await exec.select().from(offers).where(eq(offers.id, offerId)).limit(1);
    return row ?? null;
  },
};
