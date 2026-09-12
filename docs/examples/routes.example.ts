// @ts-nocheck — illustration of route registration + authorize(); lives outside apps/api and is not compiled.
import { Hono } from "hono";
import { resolvePrincipal, type PrincipalVars, err } from "./middleware/principal";
import { authorize, registerRoute } from "./middleware/authorize";
import { respond, RespondInput } from "@bbc/engagement/application/respond";
import { markRead } from "@bbc/notifications/application/mark-read";

export function buildRoutes(deps: any) {
  const app = new Hono<PrincipalVars>();
  app.use("*", resolvePrincipal({ identity: deps.identity, appOrigin: deps.env.APP_ORIGIN, internalSecrets: [deps.env.INTERNAL_API_SECRET, deps.env.INTERNAL_API_SECRET_NEXT].filter(Boolean), logger: deps.logger }));

  const guard = (perm: any, module?: string) => authorize(perm, { module, flags: deps.flags, log: deps.logger.warn });

  registerRoute("GET", "/v1/app-config", "public");
  app.get("/v1/app-config", (c) => c.json(deps.appConfig()));

  registerRoute("GET", "/v1/proposals", "proposals:read");
  app.get("/v1/proposals", guard("proposals:read", "proposals"), async (c) => c.json(await deps.feed(c.get("principal"), c.req.query("cursor"))));

  registerRoute("POST", "/v1/proposals/:id/respond", "proposals:respond");
  app.post("/v1/proposals/:id/respond", guard("proposals:respond", "engagement"), async (c) => {
    const input = RespondInput.parse({ offerId: c.req.param("id"), ...(await c.req.json()) });
    const r = await respond(deps.respondDeps, c.get("principal"), input);
    if (!r.ok) return c.json(err(r.code), r.code === "NOT_FOUND" ? 404 : 403);
    return c.json({ state: r.state, advisor: "Julia Reed" });
  });

  registerRoute("POST", "/v1/inbox/:id/read", "inbox:mark-read");
  app.post("/v1/inbox/:id/read", guard("inbox:mark-read", "notifications"), async (c) => {
    const r = await markRead(deps.db, c.get("principal"), c.req.param("id"));
    return r === "ok" ? c.json({ ok: true }) : c.json(err(r === "not_found" ? "NOT_FOUND" : "FORBIDDEN"), r === "not_found" ? 404 : 403);
  });

  registerRoute("POST", "/v1/internal/offers", "proposals:ingest");
  app.post("/v1/internal/offers", guard("proposals:ingest", "proposals"), async (c) => c.json(await deps.ingest(await c.req.json(), c.req.header("idempotency-key"))));

  registerRoute("POST", "/v1/internal/run/:job", "jobs:run");
  app.post("/v1/internal/run/:job", guard("jobs:run"), async (c) => c.json(await deps.jobs.run(c.req.param("job"))));

  return app;
}
