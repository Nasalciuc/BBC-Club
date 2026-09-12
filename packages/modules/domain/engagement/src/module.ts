import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/api/middleware/authorize";
import { apiError } from "@bbc/shared/errors";
import { respond, RespondInput } from "./application/respond";
import { responsesRepo } from "./infrastructure/responses.repo";

type Ports = { proposals: { getVisible(exec: any, actor: string, id: string): Promise<{ id: string; title: string } | null> } };

/** The concrete shape every module follows: needs → init → { exposes, routes, consumers, jobs }. */
export const engagementModule = (): ModuleDescriptor<Ports, ReturnType<typeof facade>> => ({
  name: "engagement",
  layer: "domain",
  needs: ["proposals"],
  init: ({ db, platform, ports }) => {
    const deps = { db, proposals: ports.proposals, events: { publish: (tx: any, e: any) => platform.events.publish(tx, { ...e, publishedBy: "engagement" }) } };

    const routes = new Hono<any>();
    registerRoute("POST", "/v1/proposals/:id/respond", "proposals:respond");
    routes.post("/proposals/:id/respond", authorize("proposals:respond", { module: "engagement", flags: platform.flags, log: platform.logger.warn.bind(platform.logger) }), async (c) => {
      const input = RespondInput.parse({ offerId: c.req.param("id"), ...(await c.req.json()) });
      const r = await respond(deps, c.get("principal"), input);
      if (!r.ok) return c.json(apiError(r.code), r.code === "NOT_FOUND" ? 404 : 403);
      return c.json({ state: r.state, advisor: "Julia Reed" });
    });

    return {
      exposes: facade(db),
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],      // engagement publishes offer.responded; crm and notifications consume it
      jobs: [],
    };
  },
});

function facade(db: any) {
  return {
    responsesFor: (exec: any, actorMemberId: string, offerIds: string[]) => responsesRepo.forOffers(exec ?? db, actorMemberId, offerIds),
    markSynced: (exec: any, actorMemberId: string, offerId: string, crmActivityId: string | null) => responsesRepo.markSynced(exec ?? db, actorMemberId, offerId, crmActivityId),
  };
}
