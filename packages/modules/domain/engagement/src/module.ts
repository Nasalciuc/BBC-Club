import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { offerResponses } from "@bbc/db/schema/engagement";
import { respond, RespondInput } from "./application/respond";
import { responsesRepo } from "./infrastructure/responses.repo";
import { syncOfferToCrm } from "./handlers/sync-offer-to-crm";

type Ports = {
  proposals: { getVisible(exec: any, actor: string, id: string): Promise<{ id: string; title: string } | null> };
  crm: {
    createActivity(input: {
      externalId: string;
      memberId: string;
      offerId: string;
      kind: "interested" | "dismissed";
    }): Promise<{ id: string | null }>;
  };
};

/** The concrete shape every module follows: needs → init → { exposes, routes, consumers, jobs }. */
export const engagementModule = (): ModuleDescriptor<Ports, ReturnType<typeof facade>> => ({
  name: "engagement",
  layer: "domain",
  needs: ["proposals", "crm"],
  init: ({ db, platform, ports }) => {
    const deps = {
      db,
      proposals: ports.proposals,
      events: { publish: (tx: any, e: any) => platform.events.publish(tx, { ...e, publishedBy: "engagement" }) },
    };

    const routes = new Hono<any>();
    registerRoute("POST", "/v1/proposals/:id/respond", "proposals:respond");
    routes.post(
      "/proposals/:id/respond",
      authorize("proposals:respond", {
        module: "engagement",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const input = RespondInput.parse({ offerId: c.req.param("id"), ...(await c.req.json()) });
        const r = await respond(deps, c.get("principal"), input);
        if (!r.ok) return c.json(apiError(r.code), r.code === "NOT_FOUND" ? 404 : 403);
        return c.json({ state: r.state, advisor: "Julia Reed" });
      },
    );

    return {
      exposes: facade(db),
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [
        // Lives here (not in crm) so markSynced stays behind the engagement facade — domain → integration is legal.
        {
          type: "offer.responded",
          name: "crm.onOfferResponded",
          handler: (ctx: any, payload: any) =>
            syncOfferToCrm(
              {
                tx: ctx.tx,
                crm: ports.crm,
                responses: {
                  markSynced: (exec, actor, offerId, crmActivityId) =>
                    responsesRepo.markSynced(exec, actor, offerId, crmActivityId),
                },
              },
              payload,
            ),
        },
        {
          type: "member.deleted",
          name: "engagement.onMemberDeleted",
          handler: async (ctx: any, raw: any) => {
            const evt = MemberDeletedV1.parse(raw);
            await ctx.tx.delete(offerResponses).where(eq(offerResponses.memberId, evt.memberId));
            // Last cascade consumer: wipe identifying payloads now that siblings have run.
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
