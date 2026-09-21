import { eq } from "drizzle-orm";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import type { Executor } from "@bbc/db";
import { offerResponses } from "@bbc/db/schema/engagement";
import { responsesRepo } from "./infrastructure/responses.repo";
import type { EngagementFacade } from "./api";

/**
 * Implicit signals only (views / stored responses). Member requests live in domain/requests.
 * offer_responses table is kept expand-only — do not DROP in this branch.
 */
export const engagementModule = (): ModuleDescriptor<Record<string, never>, EngagementFacade> => ({
  name: "engagement",
  layer: "domain",
  needs: [],
  init: ({ db }) => {
    const conn = db as unknown as Executor;
    return {
      exposes: facade(conn),
      routes: [],
      consumers: [
        {
          type: "member.deleted",
          name: "engagement.onMemberDeleted",
          handler: async (ctx: HandlerContext, raw: unknown) => {
            const evt = MemberDeletedV1.parse(raw);
            await ctx.tx.delete(offerResponses).where(eq(offerResponses.memberId, evt.memberId));
          },
        },
      ],
      jobs: [],
    };
  },
});

function facade(db: Executor): EngagementFacade {
  return {
    get: (exec, actorMemberId, offerId) => responsesRepo.get(exec ?? db, actorMemberId, offerId),
    responsesFor: (exec, actorMemberId, offerIds) => responsesRepo.responsesFor(exec ?? db, actorMemberId, offerIds),
    upsert: (exec, actorMemberId, offerId, response) =>
      responsesRepo.upsert(exec ?? db, actorMemberId, offerId, response),
    markSynced: (exec, actorMemberId, offerId, crmActivityId) =>
      responsesRepo.markSynced(exec ?? db, actorMemberId, offerId, crmActivityId),
  };
}
