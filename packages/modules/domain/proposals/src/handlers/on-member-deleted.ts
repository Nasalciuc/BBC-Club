import { eq } from "drizzle-orm";
import { offers, offerTargets } from "@bbc/db/schema/proposals";
import type { Executor } from "@bbc/db";

/** A deleted member leaves no id here: their rows in segment fan-outs, and every offer made to them alone. Such an offer
 *  names them in target_member_id, which the offers_targeting_consistent CHECK forbids clearing, so the offer goes;
 *  its offer_targets rows follow (ON DELETE CASCADE). */
export async function onMemberDeleted(deps: { tx: Executor; memberId: string }) {
  await deps.tx.delete(offerTargets).where(eq(offerTargets.memberId, deps.memberId));
  await deps.tx.delete(offers).where(eq(offers.targetMemberId, deps.memberId));
}
