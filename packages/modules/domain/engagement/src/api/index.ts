import type { Executor } from "@bbc/db";

export type ResponseState = { response: "interested" | "dismissed"; createdAt: Date };

/** The only import surface of @bbc/engagement. module.ts implements it; consumers import it. */
export type EngagementFacade = {
  get(exec: Executor | undefined, actorMemberId: string, offerId: string): Promise<ResponseState | null>;
  responsesFor(
    exec: Executor | undefined,
    actorMemberId: string,
    offerIds: string[],
  ): Promise<Record<string, "interested" | "dismissed">>;
  upsert(
    exec: Executor | undefined,
    actorMemberId: string,
    offerId: string,
    response: "interested" | "dismissed",
  ): Promise<ResponseState | null>;
  markSynced(
    exec: Executor | undefined,
    actorMemberId: string,
    offerId: string,
    crmActivityId: string | null,
  ): Promise<number>;
};
