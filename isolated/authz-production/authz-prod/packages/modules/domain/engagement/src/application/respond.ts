import { z } from "zod";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import type { Principal } from "@bbc/platform/authz/principal";
import { actorMemberId } from "@bbc/platform/authz/principal";
import { responsesRepo } from "../infrastructure/responses.repo";

export const RespondInput = z.object({ offerId: z.string().uuid(), response: z.enum(["interested", "dismissed"]) });
// NOTE: no memberId in the input schema. A lint rule (no-member-id-in-request-schemas) enforces this across packages/shared.

export type RespondDeps = {
  db: Executor;
  proposals: { getVisible(exec: Executor, actorMemberId: string, offerId: string): Promise<{ id: string; title: string } | null> };
  events: { publish(tx: Executor, e: { type: string; version: number; aggregateType: string; aggregateId: string; memberId: string; payload: unknown }): Promise<void> };
};

export type RespondResult = { ok: true; state: "interested" | "dismissed" } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

export async function respond(deps: RespondDeps, principal: Principal, input: z.infer<typeof RespondInput>): Promise<RespondResult> {
  const actor = actorMemberId(principal);
  if (!actor) return { ok: false, code: "FORBIDDEN" };                          // operators/system without an actor cannot respond
  return withTx(deps.db, async (tx) => {
    const offer = await deps.proposals.getVisible(tx, actor, input.offerId);    // visibility = ownership check, in SQL
    if (!offer) return { ok: false, code: "NOT_FOUND" };                       // 404, never 403 (no oracle)
    const stored = await responsesRepo.upsert(tx, actor, offer.id, input.response);
    await deps.events.publish(tx, {
      type: "offer.responded", version: 1, aggregateType: "offer", aggregateId: offer.id, memberId: actor,
      payload: { type: "offer.responded", version: 1, offerId: offer.id, memberId: actor, response: stored.response, at: new Date().toISOString() },
    });
    return { ok: true, state: stored.response };
  });
}
