import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute, type PrincipalVars } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { DEFAULT_HOME_AIRPORT } from "@bbc/shared/defaults";
import type { MembersFacade } from "@bbc/members";
import type { ProposalsFacade } from "@bbc/proposals";
import type { EngagementFacade } from "@bbc/engagement";
import type { CatalogFacade } from "@bbc/catalog";
import { toAirportVM } from "@bbc/catalog";
import { toCard, toDetail, toDestinationPin, toProfileVM } from "./view-models";

type Ports = {
  members: MembersFacade;
  proposals: ProposalsFacade;
  engagement: EngagementFacade;
  catalog: CatalogFacade;
};

/** Where an offer flies to, as the catalog places the airport. */
type Place = { region: string; countryCode: string };

/** The americas region's countries that Figma's TO NORTH AMERICA holds (Vancouver, Honolulu); Brazil has no section. */
const NORTH_AMERICA = new Set(["US", "CA", "MX"]);

/**
 * Home's sections in Figma 89:389's order and words: the offers to inspire, then one carousel per region, titled
 * `To …`. `holds` is null for the inspiring offers, which are the first six of every region.
 */
const SECTION_ORDER: Array<{ key: string; title: string; holds: ((place: Place) => boolean) | null }> = [
  { key: "inspire", title: "Inspiration", holds: null },
  { key: "europe", title: "To Europe", holds: (p) => p.region === "europe" },
  { key: "asia", title: "To Asia", holds: (p) => p.region === "asia" },
  { key: "middle_east", title: "To the Middle East", holds: (p) => p.region === "middle_east" },
  {
    key: "north_america",
    title: "To North America",
    holds: (p) => p.region === "americas" && NORTH_AMERICA.has(p.countryCode.toUpperCase()),
  },
];

/** The mobile BFF. Composes proposals + engagement + catalog → view-models. /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Ports, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  needs: ["members", "proposals", "engagement", "catalog"],
  init: ({ platform, ports }) => {
    const routes = new Hono<PrincipalVars>();

    // ── Profile ──────────────────────────────────────────────────────────────

    registerRoute("GET", "/v1/profile", "profile:read-self", "read");
    routes.get(
      "/profile",
      rateLimit(platform.rateLimit, "read"),
      authorize("profile:read-self", { module: "members", flags: platform.flags }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const [p, prefs] = await Promise.all([
          ports.members.getProfile(undefined, actor),
          ports.members.preferencesOf(undefined, actor),
        ]);
        const principal = c.get("principal");
        return c.json(toProfileVM(p, principal.kind === "member" ? principal.email : null, actor, prefs));
      },
    );

    // ── Home ─────────────────────────────────────────────────────────────────

    registerRoute("GET", "/v1/home", "fares:read", "read");
    routes.get(
      "/home",
      rateLimit(platform.rateLimit, "read"),
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

        const [destRows, offerRows] = await Promise.all([
          // ADR-IMPL-045: the site's pins are priced in the cabin the member's search starts in.
          ports.catalog.destinations(undefined, homeCode, { cabin: profile?.preferences.cabin ?? "business" }),
          ports.proposals.feed(undefined, actor, null, 50),
        ]);

        const offerRouteTos = new Set(offerRows.map((o) => String(o.routeTo).toUpperCase()));
        const destinations = destRows.map((d) => toDestinationPin(d, offerRouteTos.has(d.code.toUpperCase())));

        const placeByCode = new Map<string, Place>(
          destRows.map((d) => [d.code.toUpperCase(), { region: d.region, countryCode: d.countryCode }]),
        );
        const missing = [...new Set(offerRows.map((o) => String(o.routeTo).toUpperCase()))].filter(
          (c) => !placeByCode.has(c),
        );
        const airportRows = await ports.catalog.getAirports(undefined, [homeCode, ...missing]);
        const byCode = new Map(airportRows.map((a) => [a.code.toUpperCase(), a]));
        for (const code of missing) {
          const a = byCode.get(code);
          if (a?.region) placeByCode.set(code, { region: a.region, countryCode: a.countryCode });
        }
        const homeRow = byCode.get(homeCode) ?? null;

        const offerIds = offerRows.map((r) => r.id);
        const states = offerIds.length > 0 ? await ports.engagement.responsesFor(undefined, actor, offerIds) : {};
        const cards = offerRows.map((r) => toCard(r, states[r.id]));

        const sections = SECTION_ORDER.map(({ key, title, holds }) => {
          const items =
            holds == null
              ? cards.slice(0, 6)
              : cards.filter((card) => {
                  const place = placeByCode.get(card.route.to.toUpperCase());
                  return place != null && holds(place);
                });
          return { key, title, items };
        }).filter((s) => s.items.length > 0 || s.key === "inspire");

        const body = {
          home: homeRow ? toAirportVM(homeRow) : null,
          destinations,
          sections,
        };

        const etag = `"${createHash("sha1")
          .update(
            JSON.stringify({
              homeCode,
              // A pin's price is in the tag: a new night's prices are new pins (ADR-IMPL-045).
              destinations: destinations.map((d) => `${d.code}:${d.fromPrice}`),
              // So are the destinations' lines (ADR-IMPL-056): an airports import that writes one is a new body.
              descriptions: [body.home?.description ?? null, ...destinations.map((d) => d.description ?? null)],
              offerIds,
              states,
              // A carousel's membership is in the tag too: an airport's region or country corrected moves an offer
              // between the regions with the same offers in the same states.
              sections: sections.map((s) => [s.key, s.items.map((i) => i.id)]),
            }),
          )
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

    registerRoute("GET", "/v1/proposals", "proposals:read", "read");
    routes.get(
      "/proposals",
      rateLimit(platform.rateLimit, "read"),
      authorize("proposals:read", {
        module: "proposals",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);

        const rows = await ports.proposals.feed(undefined, actor, null);
        const offerIds = rows.map((r) => r.id);
        const states = offerIds.length > 0 ? await ports.engagement.responsesFor(undefined, actor, offerIds) : {};

        const items = rows.map((r) => toCard(r, states[r.id]));
        const personal = items.filter((i) => i.targeting === "personal").length;

        const etag = `"${createHash("sha1").update(JSON.stringify({ offerIds, states })).digest("hex").slice(0, 16)}"`;

        const ifNoneMatch = c.req.header("If-None-Match");
        if (ifNoneMatch === etag) return c.body(null, 304);

        const lastRow = rows[rows.length - 1];
        const cursor =
          lastRow && rows.length >= 20 ? { ts: lastRow.publishAt.toISOString(), id: lastRow.id } : undefined;

        return c.json({ items, summary: { total: items.length, personal }, ...(cursor ? { cursor } : {}) }, 200, {
          ETag: etag,
        });
      },
    );

    // ── Proposal detail ──────────────────────────────────────────────────────

    registerRoute("GET", "/v1/proposals/:id", "proposals:read", "read");
    routes.get(
      "/proposals/:id",
      rateLimit(platform.rateLimit, "read"),
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
          const gone = await ports.proposals.getAny(undefined, id);
          if (
            gone &&
            (gone.status === "expired" || gone.status === "withdrawn") &&
            (gone.targeting === "broadcast" || gone.targetMemberId === actor)
          ) {
            return c.json(apiError("GONE"), 410);
          }
          return c.json(apiError("NOT_FOUND"), 404);
        }

        const stateRow = await ports.engagement.get(undefined, actor, id);
        const vm = toDetail(row, stateRow?.response ?? null);
        return c.json(vm);
      },
    );

    return { exposes: {}, routes: [{ basePath: "/v1", app: routes }], consumers: [], jobs: [] };
  },
});
