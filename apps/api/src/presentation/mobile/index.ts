import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute, type PrincipalVars } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { toCard, toDetail } from "./view-models";

type Ports = {
  members: {
    getProfile(exec: unknown, actor: string): Promise<unknown | null>;
  };
  proposals: {
    feed(exec: unknown, actorMemberId: string, cursor: { ts: Date; id: string } | null, limit?: number): Promise<any[]>;
    getVisible(exec: unknown, actorMemberId: string, offerId: string): Promise<any | null>;
    getAny(exec: unknown, offerId: string): Promise<any | null>;
  };
  engagement: {
    responsesFor(
      exec: unknown,
      actorMemberId: string,
      offerIds: string[],
    ): Promise<Record<string, "interested" | "dismissed">>;
    get(
      exec: unknown,
      actorMemberId: string,
      offerId: string,
    ): Promise<{ response: "interested" | "dismissed" } | null>;
  };
};

/** The mobile BFF. Composes proposals + engagement → view-models. /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Ports, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  needs: ["members", "proposals", "engagement"],
  init: ({ platform, ports }) => {
    const routes = new Hono<PrincipalVars>();

    // ── Profile ──────────────────────────────────────────────────────────────

    // The session gate routes by profile.status: active → proposals, waitlist → waitlist, pending → keep the splash.
    registerRoute("GET", "/v1/profile", "profile:read-self");
    routes.get("/profile", authorize("profile:read-self", { module: "members", flags: platform.flags }), async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const p = await ports.members.getProfile(undefined, actor);
      // 200 with status "pending" (not 404): the member exists, the profile event is in flight
      return c.json(p ?? { memberId: actor, status: "pending" });
    });

    // ── Proposals feed ───────────────────────────────────────────────────────

    registerRoute("GET", "/v1/proposals", "proposals:read");
    routes.get(
      "/proposals",
      authorize("proposals:read", {
        module: "proposals",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);

        const rows = await ports.proposals.feed(undefined, actor, null);
        const offerIds = rows.map((r: any) => r.id as string);
        const states = offerIds.length > 0 ? await ports.engagement.responsesFor(undefined, actor, offerIds) : {};

        const items = rows.map((r: any) => toCard(r, states[r.id]));
        const personal = items.filter((i) => i.targeting === "personal").length;

        // ETag: hash of offer ids + response states (changes when new offers appear or user responds)
        const etag = `"${createHash("sha1").update(JSON.stringify({ offerIds, states })).digest("hex").slice(0, 16)}"`;

        // 304 Not Modified
        const ifNoneMatch = c.req.header("If-None-Match");
        if (ifNoneMatch === etag) return c.body(null, 304);

        const lastRow = rows[rows.length - 1] as any | undefined;
        const cursor =
          lastRow && rows.length >= 20
            ? { ts: (lastRow.publishAt as Date).toISOString(), id: lastRow.id as string }
            : undefined;

        return c.json({ items, summary: { total: items.length, personal }, ...(cursor ? { cursor } : {}) }, 200, {
          ETag: etag,
        });
      },
    );

    // ── Proposal detail ──────────────────────────────────────────────────────

    registerRoute("GET", "/v1/proposals/:id", "proposals:read");
    routes.get(
      "/proposals/:id",
      authorize("proposals:read", {
        module: "proposals",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const id = c.req.param("id");

        const row = await ports.proposals.getVisible(undefined, actor, id);
        if (!row) {
          // Check if it exists but is expired/withdrawn → 410 GONE
          const any = (await ports.proposals.getAny(undefined, id)) as any | null;
          if (
            any &&
            (any.status === "expired" || any.status === "withdrawn") &&
            (any.targeting === "broadcast" || any.targetMemberId === actor)
          ) {
            return c.json(apiError("GONE"), 410);
          }
          return c.json(apiError("NOT_FOUND"), 404);
        }

        const stateRow = await ports.engagement.get(undefined, actor, id);
        const vm = toDetail(row as any, stateRow?.response ?? null);
        return c.json(vm);
      },
    );

    return { exposes: {}, routes: [{ basePath: "/v1", app: routes }], consumers: [], jobs: [] };
  },
});
