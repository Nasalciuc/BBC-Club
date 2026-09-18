// @ts-nocheck — illustration of route registration + authorize(); lives outside apps/api and is not compiled.
import { Hono } from "hono";
import { resolvePrincipal, type PrincipalVars, err } from "./middleware/principal";
import { authorize, registerRoute } from "./middleware/authorize";
import { markRead } from "@bbc/notifications/application/mark-read";

export function buildRoutes(deps: any) {
  const app = new Hono<PrincipalVars>();
  app.use(
    "*",
    resolvePrincipal({
      identity: deps.identity,
      appOrigin: deps.env.APP_ORIGIN,
      internalSecrets: [deps.env.INTERNAL_API_SECRET, deps.env.INTERNAL_API_SECRET_NEXT].filter(Boolean),
      logger: deps.logger,
    }),
  );

  const guard = (perm: any, module?: string) => authorize(perm, { module, flags: deps.flags, log: deps.logger.warn });

  registerRoute("GET", "/v1/app-config", "public");
  app.get("/v1/app-config", (c) => c.json(deps.appConfig()));

  registerRoute("GET", "/v1/proposals", "proposals:read");
  app.get("/v1/proposals", guard("proposals:read", "proposals"), async (c) =>
    c.json(await deps.feed(c.get("principal"), c.req.query("cursor"))),
  );

  registerRoute("POST", "/v1/requests", "requests:create");
  app.post("/v1/requests", guard("requests:create", "requests"), async (c) => {
    const key = c.req.header("Idempotency-Key");
    if (!key) return c.json(err("VALIDATION"), 400);
    return c.json(await deps.submitRequest(c.get("principal"), await c.req.json(), key), 201);
  });

  registerRoute("POST", "/v1/inbox/:id/read", "inbox:mark-read");
  app.post("/v1/inbox/:id/read", guard("inbox:mark-read", "notifications"), async (c) => {
    const r = await markRead(deps.db, c.get("principal"), c.req.param("id"));
    if (!r.ok) return c.json(err(r.code), 404);
    return c.body(null, 204);
  });

  return app;
}
