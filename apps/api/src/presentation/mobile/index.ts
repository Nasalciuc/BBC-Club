import { Hono } from "hono";
import { z } from "zod";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import type { PrincipalVars } from "@bbc/shared/authz/authorize";
import { routeGate } from "@bbc/platform/ratelimit";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { DEFAULT_HOME_AIRPORT } from "@bbc/shared/defaults";
import type { MembersFacade } from "@bbc/members";
import type { ProposalsFacade } from "@bbc/proposals";
import type { CatalogFacade } from "@bbc/catalog";
import { toAirportVM } from "@bbc/catalog";
import { toBookablePlace, toCard, toDetail, toDestinationPin, toProfileVM, toSiteDealVM } from "./view-models";
import { JSON_HEADERS, PER_MEMBER_CACHE, createRevalidation, ifNoneMatchHits, serialised } from "./http-cache";

type Ports = {
  members: MembersFacade;
  proposals: ProposalsFacade;
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

/** The tables Home's body is computed from, by their generation (ADR-IMPL-075): a write to any of them moves it. */
const HOME_TABLES = [
  "platform.flags",
  "catalog.airports",
  "catalog.fares",
  "catalog.site",
  "proposals.offers",
] as const;
/** The feed's: the offers alone. */
const FEED_TABLES = ["proposals.offers"] as const;

/** The mobile BFF. Composes proposals + catalog → view-models (ADR-IMPL-075: the offers' responses are not read until
 *  something writes them). /v1/app-config stays in the host. */
export const mobileBff = (): ModuleDescriptor<Ports, Record<string, never>> => ({
  name: "mobile-bff",
  layer: "presentation",
  needs: ["members", "proposals", "catalog"],
  init: ({ platform, ports }) => {
    const routes = new Hono<PrincipalVars>();
    // ADR-IMPL-075: each route's permission, rate rule and kill flags, declared once beside its path; the BFF's routes
    // belong to the module whose data they answer with.
    const catalogGate = routeGate(platform, "catalog").on(routes, "/v1");
    const membersGate = routeGate(platform, "members").on(routes, "/v1");
    const proposalsGate = routeGate(platform, "proposals").on(routes, "/v1");
    const homeRevalidation = createRevalidation();
    const feedRevalidation = createRevalidation();
    /** The generations of these tables, or null while the process has not read them (then nothing is trusted). */
    const generationsOf = async (tables: readonly string[]) => {
      const values = await Promise.all(tables.map((t) => platform.reference.generations.current(t)));
      return values.some((v) => v === null) ? null : values;
    };

    // ── Profile ──────────────────────────────────────────────────────────────

    membersGate.get("/profile", { permission: "profile:read-self", rate: "read" }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const [p, prefs] = await Promise.all([
        ports.members.getProfile(undefined, actor),
        ports.members.preferencesOf(undefined, actor),
      ]);
      const principal = c.get("principal");
      return c.json(toProfileVM(p, principal.kind === "member" ? principal.email : null, actor, prefs));
    });

    // ── Home ─────────────────────────────────────────────────────────────────

    catalogGate.get("/home", { permission: "fares:read", rate: "read", reads: ["members", "proposals"] }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);

      const [profile, generations] = await Promise.all([
        ports.members.getProfile(undefined, actor),
        generationsOf(HOME_TABLES),
      ]);
      const homeCode = (profile?.homeAirport ?? DEFAULT_HOME_AIRPORT).toUpperCase();
      const cabin = profile?.preferences.cabin ?? "business";
      // ADR-IMPL-075: what the body is computed from — the member's home and cabin, the tables' generations, the
      // minute. The phone's copy of the body these gave is answered 304 with none of the reads below.
      const versions = generations ? homeRevalidation.versions([homeCode, cabin, generations]) : null;
      const kept = versions ? homeRevalidation.unchanged(actor, versions, c.req.header("If-None-Match")) : null;
      if (kept) return c.body(null, 304, { ETag: kept, ...PER_MEMBER_CACHE });

      const [destRows, offerRows, siteDeals] = await Promise.all([
        // ADR-IMPL-045: the site's pins are priced in the cabin the member's search starts in.
        ports.catalog.destinations(undefined, homeCode, { cabin }),
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

      // ⚑7a (ADR-IMPL-075): no response is read — nothing in production writes them yet; the read comes back with it.
      const cards = offerRows.map((r) => toCard(r, null));

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

      // ADR-IMPL-068: what a tap anywhere on the globe may open — the site's cities and origins, with the arrivals of
      // the fares and offers above; never home or its metro. Absent while `catalog.globe_tap` is off.
      const homeVM = homeRow ? toAirportVM(homeRow) : null;
      const bookable = await ports.catalog.bookable(undefined, {
        home: homeVM ? { code: homeCode, lat: homeVM.lat, lng: homeVM.lng } : { code: homeCode },
        also: [...destRows, ...missing.flatMap((code) => byCode.get(code) ?? [])].map(toBookablePlace),
      });

      const body = {
        home: homeVM,
        destinations,
        sections,
        places,
        // Absent with none: with catalog.site_offers off, Home is exactly what it was, ETag included.
        ...(deals.length > 0 ? { deals } : {}),
        ...(bookable ? { bookable } : {}),
      };

      // The tag is the body's, whole: a pin's price, city, name or place (ADR-IMPL-045), a destination's line
      // (ADR-IMPL-056), a carousel's offers, a place's name (ADR-IMPL-057), the site's deals with their prices and days
      // (ADR-IMPL-067) — whatever Home shows. The home code too, for a home airport the catalog does not know (no
      // `home` in the body). Serialised once: the tag is taken over the JSON that is sent.
      const sent = serialised(body, homeCode);
      if (versions) homeRevalidation.remember(actor, versions, sent.etag);
      if (ifNoneMatchHits(c.req.header("If-None-Match"), sent.etag)) {
        return c.body(null, 304, { ETag: sent.etag, ...PER_MEMBER_CACHE });
      }
      return c.body(sent.json, 200, { ...JSON_HEADERS, ETag: sent.etag, ...PER_MEMBER_CACHE });
    });

    // ── Proposals feed ───────────────────────────────────────────────────────

    proposalsGate.get("/proposals", { permission: "proposals:read", rate: "read" }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);

      // ADR-IMPL-075: the offers' generation and the minute; the phone's copy of what they gave is a 304, no read.
      const generations = await generationsOf(FEED_TABLES);
      const versions = generations ? feedRevalidation.versions([generations]) : null;
      const kept = versions ? feedRevalidation.unchanged(actor, versions, c.req.header("If-None-Match")) : null;
      if (kept) return c.body(null, 304, { ETag: kept, ...PER_MEMBER_CACHE });

      const rows = await ports.proposals.feed(undefined, actor, null);
      // ⚑7a (ADR-IMPL-075): no response is read — nothing in production writes them yet.
      const items = rows.map((r) => toCard(r, null));
      const personal = items.filter((i) => i.targeting === "personal").length;
      const lastRow = rows[rows.length - 1];
      const cursor = lastRow && rows.length >= 20 ? { ts: lastRow.publishAt.toISOString(), id: lastRow.id } : undefined;
      const body = { items, summary: { total: items.length, personal }, ...(cursor ? { cursor } : {}) };

      // The tag is the body's: an offer edited in place changes it, not only an offer added or gone.
      const sent = serialised(body);
      if (versions) feedRevalidation.remember(actor, versions, sent.etag);
      if (ifNoneMatchHits(c.req.header("If-None-Match"), sent.etag)) {
        return c.body(null, 304, { ETag: sent.etag, ...PER_MEMBER_CACHE });
      }
      return c.body(sent.json, 200, { ...JSON_HEADERS, ETag: sent.etag, ...PER_MEMBER_CACHE });
    });

    // ── Proposal detail ──────────────────────────────────────────────────────

    proposalsGate.get("/proposals/:id", { permission: "proposals:read", rate: "read" }, async (c) => {
      const actor = actorMemberId(c.get("principal"));
      if (!actor) return c.json(apiError("FORBIDDEN"), 403);
      const id = c.req.param("id");
      // An offer's id is a UUID (a bbcclub:// link can carry anything): anything else is no offer, never a cast
      // Postgres refuses.
      if (!z.string().uuid().safeParse(id).success) return c.json(apiError("NOT_FOUND"), 404);

      // One read: proposals' verdict (ADR-IMPL-075), the one a request made from the offer reads too. Gone and theirs
      // (everyone's, theirs, their segment's): 410. Someone else's or not yet published: 404, as if it did not exist.
      const v = await ports.proposals.verdict(undefined, actor, id);
      if (v.kind === "gone") return c.json(apiError("GONE"), 410);
      if (v.kind !== "visible") return c.json(apiError("NOT_FOUND"), 404);
      // ⚑7a (ADR-IMPL-075): no response is read until something writes them.
      return c.json(toDetail(v.offer, null));
    });

    return { exposes: {}, routes: [{ basePath: "/v1", app: routes }], consumers: [], jobs: [] };
  },
});
