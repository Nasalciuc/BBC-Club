import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute, type PrincipalVars } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/platform/authz/principal";

type Ports = { members: { getProfile(exec: unknown, actor: string): Promise<unknown | null> } };

/** The mobile BFF. Stage 2 adds routes/, view-models/ and compose/feed; /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Ports, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  needs: ["members"],
  init: ({ platform, ports }) => {
    const routes = new Hono<PrincipalVars>();

    // The session gate routes by profile.status: active → proposals, waitlist → waitlist, pending → keep the splash.
    registerRoute("GET", "/v1/profile", "profile:read-self");
    routes.get("/profile", authorize("profile:read-self", { module: "members", flags: platform.flags }), async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const p = await ports.members.getProfile(undefined, actor);
      // 200 with status "pending" (not 404): the member exists, the profile event is in flight
      return c.json(p ?? { memberId: actor, status: "pending" });
    });

    return { exposes: {}, routes: [{ basePath: "/v1", app: routes }], consumers: [], jobs: [] };
  },
});
