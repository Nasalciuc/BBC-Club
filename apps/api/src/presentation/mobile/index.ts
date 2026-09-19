import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute, type PrincipalVars } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { DEFAULT_HOME_AIRPORT } from "@bbc/shared/defaults";
import { toCard, toDetail, toAirportVM, toDestinationPin } from "./view-models";

type Ports = {
  members: {
    getProfile(exec: unknown, actor: string): Promise<{ homeAirport: string | null } | null>;
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
  catalog: {
    destinations(
      exec: unknown,
      home: string,
    ): Promise<
      Array<{
        code: string;
        name: string;
        city: string;
        countryCode: string;
        region: string;
        lat: number;
        lng: number;
        fromPrice: number;
      }>
    >;
    getAirport(
      exec: unknown,
      code: string,
    ): Promise<{
      code: string;
      name: string;
      city: string;
      countryCode: string;
      region: string;
      lat: string;
      lng: string;
    } | null>;
  };
};

const SECTION_ORDER: Array<{ key: string; title: string; region: string | null }> = [
  { key: "inspire", title: "Inspiration", region: null },
  { key: "europe", title: "Europe", region: "europe" },
  { key: "asia", title: "Asia", region: "asia" },
  { key: "middle_east", title: "Middle East", region: "middle_east" },
];

/** The mobile BFF. Composes proposals + engagement + catalog → view-models. /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Ports, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  needs: ["members", "proposals", "engagement", "catalog"],
  init: ({ platform, ports }) => {
    const routes = new Hono<PrincipalVars>();

    // ── Profile ──────────────────────────────────────────────────────────────

    registerRoute("GET", "/v1/profile", "profile:read-self");
    routes.get("/profile", authorize("profile:read-self", { module: "members", flags: platform.flags }), async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const p = await ports.members.getProfile(undefined, actor);
      return c.json(p ?? { memberId: actor, status: "pending" });
    });

    // ── Home ─────────────────────────────────────────────────────────────────

    registerRoute("GET", "/v1/home", "fares:read");
    routes.get(
      "/home",
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);

        const profile = await ports.members.getProfile(undefined, actor);
        const homeCode = (profile?.homeAirport ?? DEFAULT_HOME_AIRPORT).toUpperCase();
        const homeRow = await ports.catalog.getAirport(undefined, homeCode);

        const [destRows, offerRows] = await Promise.all([
          ports.catalog.destinations(undefined, homeCode),
          ports.proposals.feed(undefined, actor, null, 50),
        ]);

        const offerRouteTos = new Set(offerRows.map((o: any) => String(o.routeTo).toUpperCase()));
        const destinations = destRows.map((d) => toDestinationPin(d, offerRouteTos.has(d.code.toUpperCase())));

        const regionByCode = new Map(destRows.map((d) => [d.code.toUpperCase(), d.region]));
        for (const o of offerRows) {
          const code = String(o.routeTo).toUpperCase();
          if (regionByCode.has(code)) continue;
          const apt = await ports.catalog.getAirport(undefined, code);
          if (apt?.region) regionByCode.set(code, apt.region);
        }

        const offerIds = offerRows.map((r: any) => r.id as string);
        const states = offerIds.length > 0 ? await ports.engagement.responsesFor(undefined, actor, offerIds) : {};
        const cards = offerRows.map((r: any) => toCard(r, states[r.id]));

        const sections = SECTION_ORDER.map(({ key, title, region }) => {
          const items =
            region == null
              ? cards.slice(0, 6)
              : cards.filter((card) => regionByCode.get(card.route.to.toUpperCase()) === region);
          return { key, title, items };
        }).filter((s) => s.items.length > 0 || s.key === "inspire");

        const body = {
          home: homeRow ? toAirportVM(homeRow) : null,
          destinations,
          sections,
        };

        const etag = `"${createHash("sha1")
          .update(JSON.stringify({ homeCode, destinations: destinations.map((d) => d.code), offerIds, states }))
          .digest("hex")
          .slice(0, 16)}"`;
        const ifNoneMatch = c.req.header("If-None-Match");
        if (ifNoneMatch === etag) return c.body(null, 304);

        return c.json(body, 200, {
          ETag: etag,
          "Cache-Control": "private, max-age=300",
        });
      },
    );

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

        const etag = `"${createHash("sha1").update(JSON.stringify({ offerIds, states })).digest("hex").slice(0, 16)}"`;

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
