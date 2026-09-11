import type { Principal } from "@bbc/platform/authz/principal";
import { OfferRespondedV1 } from "@bbc/shared/events/offer";

/** Runs as system, acts for the event's member. The repository scope uses the same actor id the request path would,
 *  so a buggy handler cannot write an activity for a different member. */
export async function onOfferResponded(deps: {
  tx: any;
  crm: { createActivity(input: { externalId: string; memberId: string; offerId: string; kind: "interested" | "dismissed" }): Promise<{ id: string | null }> };
  responses: { markSynced(exec: any, actorMemberId: string, offerId: string, crmActivityId: string | null): Promise<number> };
}, raw: unknown) {
  const evt = OfferRespondedV1.parse(raw);
  const principal: Principal = { kind: "system", role: "system", source: "handler", actorMemberId: evt.memberId };
  if (evt.response !== "interested") return;                                     // dismissals are a signal, not a CRM activity
  const activity = await deps.crm.createActivity({ externalId: `${evt.offerId}:${evt.memberId}`, memberId: evt.memberId, offerId: evt.offerId, kind: "interested" });
  const changed = await deps.responses.markSynced(deps.tx, principal.actorMemberId!, evt.offerId, activity.id);   // scoped by the actor, like everywhere else
  if (changed !== 1) throw new Error(`markSynced affected ${changed} rows for ${evt.offerId}:${evt.memberId}`);     // loud, never silent
}
