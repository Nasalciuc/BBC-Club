import { eq } from "drizzle-orm";
import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import type { Executor } from "@bbc/db";
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

function facade(db: Executor) {
  return {
    get: (exec: Executor | undefined, actorMemberId: string, offerId: string) =>
      responsesRepo.get(exec ?? db, actorMemberId, offerId),
    responsesFor: (exec: Executor | undefined, actorMemberId: string, offerIds: string[]) =>
      responsesRepo.responsesFor(exec ?? db, actorMemberId, offerIds),
    upsert: (
      exec: Executor | undefined,
      actorMemberId: string,
      offerId: string,
      response: "interested" | "dismissed",
    ) => responsesRepo.upsert(exec ?? db, actorMemberId, offerId, response),
    markSynced: (exec: Executor | undefined, actorMemberId: string, offerId: string, crmActivityId: string | null) =>
      responsesRepo.markSynced(exec ?? db, actorMemberId, offerId, crmActivityId),
  };
}
