import { Hono } from "hono";
import { z } from "zod";
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
import { toCard, toDetail, toDestinationPin, toProfileVM, toSiteDealVM } from "./view-models";
import { PER_MEMBER_CACHE, etagOf, ifNoneMatchHits } from "./http-cache";

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

/**
 * ADR-IMPL-067: how many of the company site's deals Home carries for "Offers to inspire", after the member's own offers
 * — twice the pre-registered floor of twelve, a row of cards a thumb still scrolls, about 12 KB of Home.
 */
export const SITE_DEALS_SHOWN = 24;

/** How many of the member's offers Home reads: the inspiring six, the rest in their region's rows. */
const HOME_OFFERS_READ = 50;

/**
 * How many site deals Home asks the catalog for: SITE_DEALS_SHOWN, and one more for each offer Home reads. The catalog
 * gives one deal per city, so an offer takes at most one deal off (its city's, from its own metro), and Home still has
 * SITE_DEALS_SHOWN after them wherever the site has that many — asked beside the feed, and one cached read per home.
 */
const SITE_DEALS_ASKED = SITE_DEALS_SHOWN + HOME_OFFERS_READ;

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

        const [destRows, offerRows, siteDeals] = await Promise.all([
          // ADR-IMPL-045: the site's pins are priced in the cabin the member's search starts in.
          ports.catalog.destinations(undefined, homeCode, { cabin: profile?.preferences.cabin ?? "business" }),
          ports.proposals.feed(undefined, actor, null, HOME_OFFERS_READ),
          // ADR-IMPL-067: none while catalog.site_offers is off.
          ports.catalog.siteDeals(undefined, homeCode, SITE_DEALS_ASKED),
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
        // ADR-IMPL-057: an offer to a city no pin lists still names its city and country on its card.
        const places = missing.flatMap((code) => {
          const a = byCode.get(code);
          return a ? [{ code, city: a.city, countryCode: a.countryCode }] : [];
        });

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

        // ADR-IMPL-067: "Offers to inspire" is the member's own offers, then the site's deals — a deal to a city one of
        // the member's offers already goes to from the same city leaves it, so no city shows twice for one origin.
        // Every offer, not only the inspiring six: the others stand in their region's row (16, `To Asia`) under the
        // deals, and at rest (02) the member would see the site's price for a city their own offer goes to. Capped after
        // the filter, so the offers do not cost the member deals the site has.
        const deals = siteDeals
          .filter(
            (deal) =>
              !cards.some(
                (card) =>
                  deal.originAirports.includes(card.route.from.toUpperCase()) &&
                  deal.airports.includes(card.route.to.toUpperCase()),
              ),
          )
          .slice(0, SITE_DEALS_SHOWN)
          .map(toSiteDealVM);

        const body = {
          home: homeRow ? toAirportVM(homeRow) : null,
          destinations,
          sections,
          places,
          // Absent with none: with catalog.site_offers off, Home is exactly what it was, ETag included.
          ...(deals.length > 0 ? { deals } : {}),
        };

        // The tag is the body's, whole: a pin's price, city, name or place (ADR-IMPL-045), a destination's line
        // (ADR-IMPL-056), a carousel's offers and their states, a place's name (ADR-IMPL-057), the site's deals with
        // their prices and days (ADR-IMPL-067) — whatever Home shows. The home code too, for a home airport the catalog
        // does not know (no `home` in the body).
        const etag = etagOf({ homeCode, states, body });
        if (ifNoneMatchHits(c.req.header("If-None-Match"), etag)) {
          return c.body(null, 304, { ETag: etag, ...PER_MEMBER_CACHE });
        }

        return c.json(body, 200, { ETag: etag, ...PER_MEMBER_CACHE });
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

        const etag = etagOf({ offerIds, states });
        if (ifNoneMatchHits(c.req.header("If-None-Match"), etag)) {
          return c.body(null, 304, { ETag: etag, ...PER_MEMBER_CACHE });
        }

        const lastRow = rows[rows.length - 1];
        const cursor =
          lastRow && rows.length >= 20 ? { ts: lastRow.publishAt.toISOString(), id: lastRow.id } : undefined;

        return c.json({ items, summary: { total: items.length, personal }, ...(cursor ? { cursor } : {}) }, 200, {
          ETag: etag,
          ...PER_MEMBER_CACHE,
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
        // An offer's id is a UUID (a bbcclub:// link can carry anything): anything else is no offer, never a cast
        // Postgres refuses.
        if (!z.string().uuid().safeParse(id).success) return c.json(apiError("NOT_FOUND"), 404);

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
