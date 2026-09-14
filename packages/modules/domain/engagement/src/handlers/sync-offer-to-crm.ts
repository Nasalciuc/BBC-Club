import type { Principal } from "@bbc/shared/authz/principal";
import { OfferRespondedV1 } from "@bbc/shared/events/offer";

/** System consumer: create a CRM activity for "interested", then mark the response synced (actor-scoped). */
export async function syncOfferToCrm(
  deps: {
    tx: any;
    crm: {
      createActivity(input: {
        externalId: string;
        memberId: string;
        offerId: string;
        kind: "interested" | "dismissed";
      }): Promise<{ id: string | null }>;
    };
    responses: {
      markSynced(exec: any, actorMemberId: string, offerId: string, crmActivityId: string | null): Promise<number>;
    };
  },
  raw: unknown,
) {
  const evt = OfferRespondedV1.parse(raw);
  const principal: Principal = { kind: "system", role: "system", source: "handler", actorMemberId: evt.memberId };
  if (evt.response !== "interested") return;
  const activity = await deps.crm.createActivity({
    externalId: `${evt.offerId}:${evt.memberId}`,
    memberId: evt.memberId,
    offerId: evt.offerId,
    kind: "interested",
  });
  const changed = await deps.responses.markSynced(deps.tx, principal.actorMemberId!, evt.offerId, activity.id);
  if (changed !== 1) throw new Error(`markSynced affected ${changed} rows for ${evt.offerId}:${evt.memberId}`);
}
