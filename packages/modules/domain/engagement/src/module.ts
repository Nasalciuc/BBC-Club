import { eq } from "drizzle-orm";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { offerResponses } from "@bbc/db/schema/engagement";
import { responsesRepo } from "./infrastructure/responses.repo";

/**
 * Implicit signals only (views / stored responses). Member requests live in domain/requests.
 * offer_responses table is kept expand-only — do not DROP in this branch.
 */
export const engagementModule = (): ModuleDescriptor<Record<string, never>, ReturnType<typeof facade>> => ({
  name: "engagement",
  layer: "domain",
  needs: [],
  init: ({ db, platform }) => {
    return {
      exposes: facade(db),
      routes: [],
      consumers: [
        {
          type: "member.deleted",
          name: "engagement.onMemberDeleted",
          handler: async (ctx: any, raw: any) => {
            const evt = MemberDeletedV1.parse(raw);
            await ctx.tx.delete(offerResponses).where(eq(offerResponses.memberId, evt.memberId));
            await platform.events.tombstoneMember(ctx.tx, evt.memberId);
          },
        },
      ],
      jobs: [],
    };
  },
});

function facade(db: any) {
  return {
    get: (exec: any, actorMemberId: string, offerId: string) => responsesRepo.get(exec ?? db, actorMemberId, offerId),
    responsesFor: (exec: any, actorMemberId: string, offerIds: string[]) =>
      responsesRepo.responsesFor(exec ?? db, actorMemberId, offerIds),
    upsert: (exec: any, actorMemberId: string, offerId: string, response: "interested" | "dismissed") =>
      responsesRepo.upsert(exec ?? db, actorMemberId, offerId, response),
    markSynced: (exec: any, actorMemberId: string, offerId: string, crmActivityId: string | null) =>
      responsesRepo.markSynced(exec ?? db, actorMemberId, offerId, crmActivityId),
  };
}
