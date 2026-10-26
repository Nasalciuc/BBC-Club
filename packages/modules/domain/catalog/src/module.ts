import { Hono } from "hono";
import { z } from "zod";
import { desc, gte, sql } from "drizzle-orm";
import { errorForLog, type Db, type Executor } from "@bbc/db";
import { demandDaily } from "@bbc/db/schema/catalog";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { rateLimit } from "@bbc/platform/ratelimit";
import { SearchEvent } from "@bbc/platform";
import { apiError } from "@bbc/shared/errors";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { PLACE_PHOTOS_MAX_CODES, type PlacePhotoVM } from "@bbc/shared/api/v1/places";
import { airportsRepo } from "./infrastructure/airports.repo";
import { faresRepo } from "./infrastructure/fares.repo";
import { placePhotosRepo } from "./infrastructure/place-photos.repo";
import { siteRepo } from "./infrastructure/site.repo";
import { sitePricesRepo } from "./infrastructure/site-prices.repo";
import { createDestinationsCache } from "./application/destinations-cache";
import { recordSearch, rollupDemand } from "./application/demand";
import { expireFares } from "./application/expire-fares";
import { formatInZone } from "./application/flight-local";
import { homeSuggestion, homeZones, popularFrom } from "./application/discovery";
import { importCatalog, ImportBody, ImportError } from "./application/import";
import { PlacePhotoOverride, parseCodes, resolvePlacePhotos, toPlacePhotoVM } from "./application/place-photos";
import type { Fetch } from "./application/place-photo-sources";
import { systemClock, type SiteClock } from "./application/site-cms";
import { refreshSitePrices, type FailedRoutes } from "./application/refresh-site-prices";
import {
  SEARCH_TIMEOUT_MS,
  resolveIndicative,
  sitePriceClient,
  type Resolution,
  type SiteUnavailable,
  type StoredSitePrice,
} from "./application/site-prices";
import { metrosFor, originMetros, pickDeals, type DealCandidate } from "./application/site-deals";
import { syncSite } from "./application/site-sync";
import {
  pricedAirport,
  sourcedEstimateVM,
  toAirportVM,
  toEstimateVM,
  toFareVM,
  type AirportRow,
} from "./application/to-fare-vm";
import { estimateFare } from "./pricing/estimate";
import { estimateSources as readEstimateSources, type StoredRules } from "./pricing/estimate-rules";
import { bookableFrom } from "./application/bookable";
import type { BookablePlace, CatalogFacade, DestinationPin, SiteDeal } from "./api";

function isVisible(row: { published: boolean; validFrom: Date; validUntil: Date }, now = new Date()) {
  return row.published && row.validFrom <= now && row.validUntil > now;
}

/** A route's IATA code as a member's request may carry it (upper-cased first). */
const IATA = /^[A-Z]{3}$/;
/** A fare's id is a UUID: anything else is no fare (404), never a cast Postgres refuses (500). */
const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/** The travel days fares are sold for: from yesterday (a member a day behind UTC still means today) to two years ahead.
 *  A day outside them has no fare — the search answers an empty list without asking Postgres (a year it cannot store
 *  was a 500). Never an error: the app's recent searches keep their dates, and a day gone by is still sent. */
function searchWhenInRange(when: Date, now = new Date()): boolean {
  // Travel days, not a rolling 24 hours: yesterday begins at its UTC midnight, so a member west of UTC whose
  // yesterday is still their today is in range at any hour of the server's day.
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const latest = new Date(now);
  latest.setUTCFullYear(latest.getUTCFullYear() + 2);
  return when >= earliest && when <= latest;
}

/** ADR-IMPL-045: at most this many of the site's cities get a pin from one home airport. */
export const SITE_PINS = 12;
/** How long Home's site pins are kept, in seconds (createDestinationsCache's minute, or Redis's). */
const SITE_PINS_CACHE_S = 60;
/** ADR-IMPL-067: how long one home's site deals are kept, in seconds. */
const SITE_DEALS_CACHE_S = 60;
/**
 * ADR-IMPL-067: what a read kept `ttlS` seconds asks of a route's day (and of a stored answer's), so nothing kept is
 * served past it: the cache's time, 10 % more since Redis keeps a key up to 1.1 × its TTL (the platform's cache spreads
 * its expiries), and a few seconds for the read itself — 75 s for a minute.
 */
const keptMargin = (ttlS: number) => Math.ceil(ttlS * 1.1) + 9;

/** For tests: `fetch` answers for the place-photo sources (Wikidata, Commons, Pexels) and the site — its API and its
 *  price search (ADR-IMPL-063); `siteClock` is the time the site's API pacing, the price job's pacing and the price
 *  breaker wait on, so a test's night takes no real time. */
export const catalogModule = (
  opts: { fetch?: Fetch; siteClock?: SiteClock } = {},
): ModuleDescriptor<Record<string, never>, CatalogFacade> => ({
  name: "catalog",
  layer: "domain",
  init: ({ db, platform, env }) => {
    const conn = db as unknown as Executor;
    /** ADR-IMPL-043: place photos. On unless an operator turns the flag row off; then no photo is served or looked up. */
    const placePhotosOn = () => platform.flags.isEnabled("catalog.place_photos", true);
    const destinationsCache = createDestinationsCache();
    const sitePinsCache = createDestinationsCache<DestinationPin & { airports: string[] }>();
    const siteDealsCache = createDestinationsCache<SiteDeal>();
    const bookableCache = createDestinationsCache<BookablePlace>();
    const invalidateMaps = async () => {
      destinationsCache.clear();
      sitePinsCache.clear();
      siteDealsCache.clear();
      bookableCache.clear();
      await platform.cache.bump("catalog:dest:gen");
      await platform.cache.bump("catalog:airports:gen");
    };
    const estimateSources = (metric: "search" | "request" | "home") => readEstimateSources(platform, metric);
    const siteClock = opts.siteClock ?? systemClock;
    /** ADR-IMPL-063: the company's site's price search — one client, and one breaker, per process. */
    const sitePrices = sitePriceClient({
      fetch: (url, init) => (opts.fetch ?? fetch)(url, init),
      userAgent: `BBCClub/1.0 (${env.APP_ORIGIN}; site prices)`,
      clock: siteClock,
    });

    /** ADR-IMPL-063: the routes the site failed the refresh job, remembered from run to run in this process (as the
     *  breaker is), so a route it keeps failing waits its hour and goes last. */
    const siteFailures: FailedRoutes = new Map();
    /** ADR-IMPL-063: the refresh job asks the site only while estimates (the master switch), the site's prices and
     *  Home's site pins — the routes it keeps are theirs — are all on. Read before each question (cached, ~35 s to
     *  reach every replica): one turned off stops a run already going. */
    const refreshSitePricesOn = async () =>
      (await platform.flags.isEnabled("catalog.estimates", false)) &&
      (await platform.flags.isEnabled("catalog.site_prices", false)) &&
      (await platform.flags.isEnabled("catalog.site_pins", false));

    /** The search's one live question to the site (ADR-IMPL-063), within a second; what it learns is stored, so Home's
     *  pins and the quote that follows show the same number. An error stores nothing: the formula stands in. */
    async function askSiteNow(q: {
      from: string;
      to: string;
    }): Promise<{ row: StoredSitePrice } | { unavailable: SiteUnavailable }> {
      const route = { ...q, trip: "round_trip" as const };
      const answer = await sitePrices.ask(route, { timeoutMs: SEARCH_TIMEOUT_MS });
      if (answer.kind === "unavailable") {
        platform.metrics.inc("site_prices_unavailable", { reason: answer.reason });
        // Codes and the reason only — never a price. While the breaker is open every search would say it: not logged.
        if (answer.reason === "bad_request") {
          platform.logger.error({ from: q.from, to: q.to }, "site price refused our request (400)");
        } else if (answer.reason !== "breaker") {
          platform.logger.warn({ reason: answer.reason }, "site price unavailable, the formula stands in");
        }
        return { unavailable: answer.reason };
      }
      platform.metrics.inc("site_prices_answered", { status: answer.kind });
      try {
        return { row: await sitePricesRepo.store(conn, route, answer) };
      } catch (err) {
        // The answer is the site's either way; only the next reader will not find it.
        platform.logger.warn({ err: errorForLog(err) }, "site price not stored");
        const figures =
          answer.kind === "priced" ? answer.figures : { business: null, first: null, premiumEconomy: null };
        return { row: { status: answer.kind, ...figures, fetchedAt: new Date() } };
      }
    }

    /**
     * D6's order for one route and cabin once a published fare is ruled out (ADR-IMPL-063): the site's stored answer;
     * then, for an undated search only (`live`), one live question; then the formula where the site could not be asked —
     * or, for Home's pins and a quote, which never ask it, where nothing is stored. `stored` reads the route's row (the
     * pins pass the one batch they read).
     */
    function siteResolution(
      from: AirportRow,
      to: AirportRow,
      cabin: "business" | "first",
      rules: StoredRules | null,
      opts: { live: boolean; stored: () => Promise<StoredSitePrice | null> },
    ) {
      const a = pricedAirport(from);
      const b = pricedAirport(to);
      return resolveIndicative(
        { from: a, to: b, cabin },
        {
          stored: opts.stored,
          live: opts.live ? () => askSiteNow({ from: a.code, to: b.code }) : undefined,
          formula: () => (rules ? (estimateFare(rules.rules, a, b, cabin)?.amount ?? null) : null),
        },
      );
    }

    /** A resolution as the estimate a member sees, with its source; null when there is no number. */
    function resolvedVM(r: Resolution, cabin: "business" | "first") {
      if (r.kind === "site") return sourcedEstimateVM(r.amount, cabin, { kind: "site", asOf: r.asOf });
      if (r.kind === "club") return sourcedEstimateVM(r.amount, cabin, { kind: "club" });
      return null;
    }

    async function indicativeEstimate(
      from: AirportRow,
      to: AirportRow,
      cabin: "business" | "first",
    ): Promise<ReturnType<typeof toEstimateVM>> {
      const sources = await estimateSources("search");
      if (!sources) return null;
      let estimate: ReturnType<typeof toEstimateVM>;
      if (!sources.site) {
        // The site off: the formula alone, exactly as before ADR-IMPL-063.
        if (!sources.rules) return null;
        estimate = toEstimateVM(sources.rules.rules, from, to, cabin);
      } else {
        const r = await siteResolution(from, to, cabin, sources.rules, {
          live: true,
          stored: () => sitePricesRepo.fresh(conn, from.code.trim(), to.code.trim(), "round_trip"),
        });
        platform.metrics.inc("search_site_prices", { source: r.kind, how: r.how });
        estimate = resolvedVM(r, cabin);
      }
      if (estimate) platform.metrics.inc("search_estimates_shown", { cabin });
      return estimate;
    }

    /**
     * ADR-IMPL-045: the site's cities listed from `home`, as pins priced the way their search will be — the formula, in
     * the member's cabin (ADR-IMPL-037), so a pin, its estimate row and the quote it leads to show one number. With
     * `catalog.site_prices` on (ADR-IMPL-063): the site's stored answers, read in one batch, else the formula — never a
     * call to the site; a city the company has no price for gets no pin. Nothing unless `catalog.site_pins` is on and
     * estimates are (no price, no pin). Cached like the fares' pins: 60 s, and dropped when the sync or an import bumps
     * the generation; the site's answers the job stores are seen within the minute.
     */
    async function sitePins(
      home: string,
      cabin: "business" | "first",
    ): Promise<(DestinationPin & { airports: string[] })[]> {
      if (!(await platform.flags.isEnabled("catalog.site_pins", false))) return [];
      const sources = await estimateSources("home");
      if (!sources) return [];
      const { site, rules } = sources;
      const key = site
        ? `${home.toUpperCase()}:${cabin}:${rules?.fingerprint ?? "-"}:site`
        : `${home.toUpperCase()}:${cabin}:${rules?.fingerprint}`;
      const load = async () => {
        const [homeRow, rows] = await Promise.all([
          airportsRepo.get(conn, home),
          siteRepo.pinsFrom(conn, home, SITE_PINS * 3, keptMargin(SITE_PINS_CACHE_S)),
        ]);
        if (!homeRow) return [];
        // Kept for the pins' minute: an answer that would pass its 24 hours within it is not read.
        const answers = site
          ? await sitePricesRepo.freshFrom(
              conn,
              homeRow.code.trim(),
              rows.map((r) => r.airport.code.trim()),
              "round_trip",
              keptMargin(SITE_PINS_CACHE_S),
            )
          : null;
        const priced = await Promise.all(
          rows.map(async (r): Promise<{ amount: number; source?: "site" | "club" } | null> => {
            if (!answers) {
              const estimate = rules ? toEstimateVM(rules.rules, homeRow, r.airport, cabin) : null;
              return estimate ? { amount: estimate.amount } : null;
            }
            const resolved = await siteResolution(homeRow, r.airport, cabin, rules, {
              live: false,
              stored: async () => answers.get(r.airport.code.trim()) ?? null,
            });
            return resolved.kind === "none" ? null : { amount: resolved.amount, source: resolved.kind };
          }),
        );
        return rows.flatMap((r, i) => {
          const price = priced[i];
          if (!price) return [];
          return [
            {
              code: r.airport.code.trim(),
              name: r.airport.name,
              city: r.airport.city,
              countryCode: r.airport.countryCode,
              region: r.airport.region,
              lat: Number(r.airport.lat),
              lng: Number(r.airport.lng),
              description: r.airport.description,
              fromPrice: price.amount,
              ...(price.source ? { priceSource: price.source } : {}),
              airports: r.airports,
            },
          ];
        });
      };
      const gen = await platform.cache.generation("catalog:dest:gen");
      if (gen == null) return sitePinsCache.get(key, load);
      return platform.cache.getOrLoad(`catalog:site:${gen}:${key}`, SITE_PINS_CACHE_S, load);
    }

    /**
     * ADR-IMPL-067: the site's deals for `home`, at most `limit` — from home and its metro first, then from the nearest
     * cities the site sells from, one deal per destination city (`application/site-deals.ts`). Read from the snapshot
     * the sync writes twice a day, never from the site; only deals served `marginS` seconds from now. Two reads (home,
     * the origins), then one per round of metros — one round unless the nearest metros' deals overlap past what they
     * hold.
     */
    async function loadSiteDeals(
      e: Executor,
      home: string,
      limit: number,
      photos: boolean,
      marginS: number,
    ): Promise<SiteDeal[]> {
      const [homeRow, origins] = await Promise.all([airportsRepo.get(e, home), siteRepo.dealOrigins(e, marginS)]);
      if (!homeRow || origins.length === 0 || limit <= 0) return [];
      const at = { code: homeRow.code.trim(), lat: Number(homeRow.lat), lng: Number(homeRow.lng) };
      const metros = originMetros(at, origins);
      const counts = new Map(origins.map((o) => [o.code, o.deals]));
      type Row = Awaited<ReturnType<typeof siteRepo.dealsFrom>>[number] & DealCandidate;
      const rows: Row[] = [];
      let asked = 0;
      let picked: ReturnType<typeof pickDeals<Row>> = [];
      while (asked < metros.length) {
        const next = metros.slice(asked);
        const n = metrosFor(next, counts, limit - picked.length);
        const from = next.slice(0, n).flatMap((m) => m.airports);
        for (const r of await siteRepo.dealsFrom(e, from, marginS, photos)) {
          rows.push({ ...r, to: { lat: Number(r.airport.lat), lng: Number(r.airport.lng) } });
        }
        asked += n;
        picked = pickDeals(at, metros.slice(0, asked), rows, limit);
        if (picked.length >= limit) break;
      }
      return picked.map(({ deal, metro }) => {
        const photo = deal.photo ? toPlacePhotoVM(deal.photo) : null;
        return {
          id: `site-${deal.deal}-${deal.routeFrom}`,
          destination: {
            ...toAirportVM(deal.airport),
            photo: photo?.kind === "photo" ? { card: photo.card, hero: photo.hero, credit: photo.credit } : null,
          },
          origin: { code: deal.routeFrom, city: metro.city },
          price: { amount: deal.price, currency: "USD" as const, basis: "site" as const, from: true as const },
          validUntil: deal.validUntil.toISOString(),
          airports: [...deal.airports],
          originAirports: [...metro.airports],
        };
      });
    }

    /** ADR-IMPL-067: Home's site deals, behind `catalog.site_offers` (seeded off); cached like the site's pins — a minute,
     *  dropped when the sync or an import bumps the generation. With an executor, read now, uncached. */
    async function siteDeals(exec: Executor | undefined, home: string, limit: number): Promise<SiteDeal[]> {
      if (!(await platform.flags.isEnabled("catalog.site_offers", false))) return [];
      const photos = await placePhotosOn();
      if (exec) return loadSiteDeals(exec, home, limit, photos, 0);
      const key = `${home.toUpperCase()}:${limit}:${photos ? "photos" : "-"}`;
      const load = () => loadSiteDeals(conn, home, limit, photos, keptMargin(SITE_DEALS_CACHE_S));
      const gen = await platform.cache.generation("catalog:dest:gen");
      if (gen == null) return siteDealsCache.get(key, load);
      return platform.cache.getOrLoad(`catalog:deals:${gen}:${key}`, SITE_DEALS_CACHE_S, load);
    }

    /**
     * ADR-IMPL-068: the site's part of what a tap on the globe may open — the same for every member (home is taken out
     * per call), so one entry, cached like the site's pins: a minute, dropped when the sync or an import bumps the
     * generation, so its routes are asked to be served the time it is kept. `exec` (a caller's transaction) reads it
     * uncached.
     */
    async function siteBookable(exec: Executor | undefined): Promise<BookablePlace[]> {
      if (exec) return siteRepo.bookable(exec);
      const load = () => siteRepo.bookable(conn, keptMargin(SITE_PINS_CACHE_S));
      const gen = await platform.cache.generation("catalog:dest:gen");
      if (gen == null) return bookableCache.get("ALL", load);
      return platform.cache.getOrLoad(`catalog:bookable:${gen}`, SITE_PINS_CACHE_S, load);
    }

    /** ADR-IMPL-045: the site's photos, and the cities kept out of them (`skip`: the site's ids). Null: off. */
    async function sitePhotos(): Promise<{ skip: ReadonlySet<number> } | null> {
      const v = await platform.flags.read("catalog.site_photos");
      if (v?.enabled !== true) return null;
      const skip = Array.isArray(v.skip) ? v.skip.filter((x): x is number => Number.isInteger(x)) : [];
      return { skip: new Set(skip) };
    }

    const expose: CatalogFacade = {
      searchFares: (exec, q) => faresRepo.search(exec ?? conn, q),
      getFare: (exec, id) => faresRepo.getAny(exec ?? conn, id),
      destinations: async (exec, home, opts) => {
        const fares = await (async () => {
          if (exec) return faresRepo.destinations(exec, home);
          const gen = await platform.cache.generation("catalog:dest:gen");
          if (gen == null) return destinationsCache.get(home, () => faresRepo.destinations(conn, home));
          const code = home.toUpperCase();
          return platform.cache.getOrLoad(`catalog:dest:${gen}:${code}`, 60, () => faresRepo.destinations(conn, home));
        })();
        // ADR-IMPL-045: after the fares' pins, the site's cities none of whose airports is pinned already — by a fare,
        // or by a site city before it (two cities naming one airport give one pin).
        const site = await sitePins(home, opts?.cabin ?? "business");
        if (site.length === 0) return fares;
        const pinned = new Set(fares.map((f) => f.code.trim()));
        const added: DestinationPin[] = [];
        for (const { airports, ...pin } of site) {
          if (added.length === SITE_PINS) break;
          if (pinned.has(pin.code) || airports.some((c) => pinned.has(c))) continue;
          for (const c of airports) pinned.add(c);
          added.push(pin);
        }
        return [...fares, ...added];
      },
      bookable: async (exec, q) => {
        // The cached flag row first: off (every environment until an operator turns it on), nothing of the set is read.
        if (!(await platform.flags.isEnabled("catalog.globe_tap", false))) return null;
        return bookableFrom(await siteBookable(exec), q.home, q.also);
      },
      searchAirports: (exec, q) => airportsRepo.search(exec ?? conn, q),
      getAirport: (exec, code) => airportsRepo.get(exec ?? conn, code),
      getAirports: (exec, codes) => airportsRepo.getMany(exec ?? conn, [...codes]),
      indicativeFor: async (exec, q) => {
        // The cached flag rows first: with estimates off (production today) or no valid rules, the question costs no
        // query. The request module counts what it stores (`request_estimates_stored`), after its insert.
        const sources = await estimateSources("request");
        if (!sources) return null;
        const from = q.from.toUpperCase();
        const to = q.to.toUpperCase();
        const e = exec ?? conn;
        const [airports, rows] = await Promise.all([
          airportsRepo.getMany(e, [from, to]),
          faresRepo.search(e, { from, to, cabin: q.cabin }),
        ]);
        const fromApt = airports.find((a) => a.code === from);
        const toApt = airports.find((a) => a.code === to);
        // Published fares always win: the search showed them, not an estimate.
        if (!fromApt || !toApt || rows.length > 0) return null;
        const { site, rules } = sources;
        if (!site) {
          // The site off: the formula alone, exactly as before ADR-IMPL-063.
          const estimate = rules ? toEstimateVM(rules.rules, fromApt, toApt, q.cabin) : null;
          return estimate && rules ? { ...estimate, rules: rules.fingerprint } : null;
        }
        // ADR-IMPL-063: the site's stored answer — the one the search stored — else the formula. Never a call to the
        // site: a quote asks this inside its transaction, under its lock.
        const r = await siteResolution(fromApt, toApt, q.cabin, rules, {
          live: false,
          stored: () => sitePricesRepo.fresh(e, from, to, "round_trip"),
        });
        const estimate = resolvedVM(r, q.cabin);
        if (!estimate) return null;
        return r.kind === "club" && rules ? { ...estimate, rules: rules.fingerprint } : estimate;
      },
      siteDeals,
      importCsv: (input) => importCatalog({ db: conn as Db }, ImportBody.parse(input)),
    };

    const routes = new Hono<AppEnv>();

    registerRoute("GET", "/v1/search", "fares:read", "search");
    routes.get(
      "/search",
      rateLimit(platform.rateLimit, "search"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const from = (c.req.query("from") ?? "").toUpperCase();
        const to = (c.req.query("to") ?? "").toUpperCase();
        const cabin = c.req.query("cabin") as "business" | "first" | undefined;
        const whenRaw = c.req.query("when");
        if (!IATA.test(from) || !IATA.test(to) || (cabin !== "business" && cabin !== "first")) {
          return c.json(apiError("VALIDATION", { message: "from, to (IATA), cabin required" }), 400);
        }
        const when = whenRaw ? new Date(whenRaw) : undefined;
        if (when && Number.isNaN(when.getTime())) {
          return c.json(apiError("VALIDATION", { message: "when must be ISO datetime" }), 400);
        }
        // A day gone by (a recent search's remembered date) or further out than anything is sold: no fare flies then.
        // An empty list, as for any day without one — an error would come back on every Try again.
        const sold = !when || searchWhenInRange(when);

        const [fromApt, toApt, rows] = await Promise.all([
          airportsRepo.get(conn, from),
          airportsRepo.get(conn, to),
          sold ? faresRepo.search(conn, { from, to, cabin, ...(when ? { when } : {}) }) : Promise.resolve([]),
        ]);
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);

        const items = rows.map((r) => toFareVM(r, { from: fromApt, to: toApt }, false));
        // Demand counts the days fares are sold for; a day outside them is no route's demand.
        if (sold) {
          platform.search.note({
            from,
            to,
            cabin,
            month: (when ?? new Date()).toISOString().slice(0, 7),
            hadFares: items.length > 0,
            results: items.length,
          });
        }
        // No fare in this cabin: the company's formula, as an indicative price (ADR-IMPL-037). Undated searches only —
        // with a date, the route may have fares on other days, and published fares always win. The flag rows are read
        // only then, so searches with fares cost nothing extra. The rules are not in the repository: each environment
        // holds them in `catalog.pricing_rules` (scripts/load-pricing-rules.ts).
        const estimate = items.length === 0 && !when ? await indicativeEstimate(fromApt, toApt, cabin) : null;
        return c.json({
          from: toAirportVM(fromApt),
          to: toAirportVM(toApt),
          items,
          offer: null,
          estimate,
        });
      },
    );

    registerRoute("GET", "/v1/fares/:id", "fares:read", "read");
    routes.get(
      "/fares/:id",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json(apiError("NOT_FOUND"), 404);
        const row = await faresRepo.getAny(conn, id);
        if (!row) return c.json(apiError("NOT_FOUND"), 404);

        const [fromApt, toApt] = await Promise.all([
          airportsRepo.get(conn, row.routeFrom),
          airportsRepo.get(conn, row.routeTo),
        ]);
        if (!isVisible(row)) {
          return c.json(
            apiError("GONE", {
              message: "This fare has closed.",
              context: {
                price: parseFloat(row.price),
                currency: row.currency,
                validUntil: row.validUntil.toISOString(),
                from: row.routeFrom,
                to: row.routeTo,
                // Figma 135:848 names what closed: the route by its cities, the airline and cabin, the day it left
                // the origin — that airport's day, never the server's (ADR-IMPL-019).
                fromCity: fromApt?.city ?? null,
                toCity: toApt?.city ?? null,
                carrier: row.carrierName,
                cabin: row.cabin,
                departDate: row.departAt && fromApt ? formatInZone(row.departAt.toISOString(), fromApt.tz).ymd : null,
              },
            }),
            410,
          );
        }
        if (!fromApt || !toApt) return c.json(apiError("NOT_FOUND"), 404);
        return c.json(toFareVM(row, { from: fromApt, to: toApt }, false));
      },
    );

    registerRoute("GET", "/v1/airports", "fares:read", "read");
    routes.get(
      "/airports",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const raw = c.req.query("q") ?? "";
        // Postgres text cannot hold a NUL: no airport has one, and the query would fail.
        if (raw.includes("\u0000")) return c.json(apiError("VALIDATION", { message: "q has a NUL character" }), 400);
        const q = raw.slice(0, 64);
        const gen = await platform.cache.generation("catalog:airports:gen");
        const rows =
          gen == null
            ? await airportsRepo.search(conn, q)
            : await platform.cache.getOrLoad(`catalog:airports:${gen}:${q.toLowerCase()}`, 60, () =>
                airportsRepo.search(conn, q),
              );
        return c.json(rows.map((r) => toAirportVM(r)));
      },
    );

    // ADR-IMPL-039: "Popular from <city>" — searched routes first, then the hubs; names only. Cached 5 minutes with the
    // airports' generation (an import refreshes it); without Redis, three small queries.
    registerRoute("GET", "/v1/airports/popular", "fares:read", "read");
    routes.get(
      "/airports/popular",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const from = (c.req.query("from") ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(from)) return c.json(apiError("VALIDATION", { message: "from (IATA) required" }), 400);
        const origin = await airportsRepo.get(conn, from);
        if (!origin) return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);
        const gen = await platform.cache.generation("catalog:airports:gen");
        const picked =
          gen == null
            ? await popularFrom(conn, origin)
            : await platform.cache.getOrLoad(`catalog:popular:${gen}:${from}`, 300, () => popularFrom(conn, origin));
        platform.metrics.inc("popular_destinations_shown", { source: "searches" }, picked.fromSearches);
        platform.metrics.inc(
          "popular_destinations_shown",
          { source: "hubs" },
          picked.destinations.length - picked.fromSearches,
        );
        return c.json({ from: toAirportVM(origin), destinations: picked.destinations.map((a) => toAirportVM(a)) });
      },
    );

    // ADR-IMPL-039: the home airport suggested at onboarding, from the phone's time zone.
    registerRoute("GET", "/v1/airports/home-suggestion", "fares:read", "read");
    routes.get(
      "/airports/home-suggestion",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const zones = homeZones(c.req.query("tz") ?? "");
        if (!zones) return c.json(apiError("VALIDATION", { message: "tz must be an IANA time zone" }), 400);
        const airport = await homeSuggestion(conn, zones);
        return c.json({ airport: airport ? toAirportVM(airport) : null });
      },
    );

    // ADR-IMPL-043: the photo for each city asked about — a photograph's addresses and credit, a satellite view's
    // centre, or nothing yet. Airports never asked about before get a row the resolve-place-photos job fills.
    registerRoute("GET", "/v1/places/photos", "fares:read", "read");
    routes.get(
      "/places/photos",
      rateLimit(platform.rateLimit, "read"),
      authorize("fares:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const codes = parseCodes(c.req.query("codes"));
        if (!codes) {
          return c.json(
            apiError("VALIDATION", { message: `codes: 1 to ${PLACE_PHOTOS_MAX_CODES} IATA codes, comma-separated` }),
            400,
          );
        }
        if (!(await placePhotosOn())) return c.json({ items: [] satisfies PlacePhotoVM[] });
        const rows = await placePhotosRepo.getMany(conn, codes);
        const known = new Map(rows.map((r) => [r.code.trim(), toPlacePhotoVM(r)]));
        const added = new Set(
          await placePhotosRepo.addPending(
            conn,
            codes.filter((code) => !known.has(code)),
          ),
        );
        if (added.size > 0) platform.metrics.inc("place_photos_requested", {}, added.size);
        const items = codes.flatMap((code): PlacePhotoVM[] => {
          const vm = known.get(code);
          if (vm) return [vm];
          return added.has(code) ? [{ code, kind: "none" }] : [];
        });
        return c.json({ items });
      },
    );

    // ADR-IMPL-043: an operator's own photo for a city (a wrong or poor one found automatically): it replaces what the
    // job found, never expires, and DELETE hands the city back to the job.
    registerRoute("PUT", "/v1/internal/places/:code/photo", "catalog:import");
    routes.put(
      "/internal/places/:code/photo",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const code = c.req.param("code").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) return c.json(apiError("VALIDATION", { message: "code (IATA) required" }), 400);
        const parsed = PlacePhotoOverride.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        if (!(await airportsRepo.get(conn, code))) {
          return c.json(apiError("NOT_FOUND", { message: "unknown airport" }), 404);
        }
        const { card, hero, credit } = parsed.data;
        const row = await placePhotosRepo.setOverride(conn, code, {
          cardUrl: card,
          heroUrl: hero,
          author: credit?.author ?? null,
          license: credit?.license ?? null,
          link: credit?.link ?? null,
        });
        return c.json(toPlacePhotoVM(row));
      },
    );

    registerRoute("DELETE", "/v1/internal/places/:code/photo", "catalog:import");
    routes.delete(
      "/internal/places/:code/photo",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const code = c.req.param("code").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) return c.json(apiError("VALIDATION", { message: "code (IATA) required" }), 400);
        if (!(await placePhotosRepo.clearOverride(conn, code))) {
          return c.json(apiError("NOT_FOUND", { message: "no operator photo for this airport" }), 404);
        }
        return c.body(null, 204);
      },
    );

    registerRoute("POST", "/v1/internal/catalog/import", "catalog:import");
    routes.post(
      "/internal/catalog/import",
      authorize("catalog:import", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const parsed = ImportBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        try {
          const r = await expose.importCsv(parsed.data);
          await invalidateMaps();
          return c.json(r);
        } catch (e: unknown) {
          // The file's fault, row by row; anything else is ours (the error contract logs it without the query's values).
          if (e instanceof ImportError) {
            return c.json(apiError("VALIDATION", { message: "The file was not imported.", details: e.details }), 400);
          }
          throw e;
        }
      },
    );

    registerRoute("GET", "/v1/internal/demand", "ops:read");
    routes.get(
      "/internal/demand",
      authorize("ops:read", {
        module: "catalog",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const days = Number(c.req.query("days") ?? "7");
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          return c.json(apiError("VALIDATION", { message: "days must be an integer from 1 to 90" }), 400);
        }
        const since = new Date(Date.now() - days * 86_400_000);
        const rows = await conn
          .select({
            from: demandDaily.routeFrom,
            to: demandDaily.routeTo,
            cabin: demandDaily.cabin,
            searches: sql<number>`sum(${demandDaily.searches})::int`.mapWith(Number),
            searchesWithoutFare: sql<number>`sum(${demandDaily.searchesWithoutFare})::int`.mapWith(Number),
          })
          .from(demandDaily)
          .where(gte(demandDaily.day, since))
          .groupBy(demandDaily.routeFrom, demandDaily.routeTo, demandDaily.cabin)
          .orderBy(desc(sql`sum(${demandDaily.searchesWithoutFare})`), desc(sql`sum(${demandDaily.searches})`));
        return c.json({ days, routes: rows });
      },
    );

    if (platform.kafka && platform.redis && env.APP_ROLE !== "api" && env.KAFKA_BROKERS) {
      const redis = platform.redis;
      const loop = platform.kafka
        .consume({
          clientId: "bbc-demand",
          groupId: "catalog.demand",
          topic: "bbc.search.v1",
          consumerName: "catalog.demand",
          signal: platform.signal,
          handle: async (_eventId, value) => {
            const parsed = SearchEvent.safeParse(value);
            if (!parsed.success) {
              platform.metrics.inc("search_events_rejected");
              return;
            }
            await recordSearch(redis, parsed.data);
          },
        })
        .catch((err: unknown) => {
          platform.logger.error({ err: errorForLog(err) }, "demand consumer stopped");
        });
      platform.lifecycle.onClose(async () => {
        await loop;
      });
    }

    return {
      exposes: expose,
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [
        {
          name: "expire-fares",
          spec: {
            cron: "*/15 * * * *",
            singleton: true,
            timeoutMs: 30_000,
            handler: async () => {
              const out = await expireFares({ db: conn });
              await invalidateMaps();
              return out;
            },
          },
        },
        {
          name: "demand-rollup",
          spec: {
            cron: "15 3 * * *",
            singleton: true,
            timeoutMs: 60_000,
            handler: async () => {
              if (!platform.redis) return { skipped: 1, rows: 0 };
              return { skipped: 0, ...(await rollupDemand(platform.redis, conn)) };
            },
          },
        },
        {
          // ADR-IMPL-045: the site's destinations. With its photos, its pins, its deals and the globe's tap
          // (ADR-IMPL-068: what a tap may open is the site's cities) off, nothing is asked and the site's photos go back
          // to Wikimedia. ADR-IMPL-062: the site's API allows 120 requests a minute per IP, so
          // its ~241 pages start 1.2 s apart (about five minutes), then ~150 photo checks four at a time. That minute is
          // the host's: staging's cron reads the site at the same minutes from the same address, and at about 50 a
          // minute each the two reads stay under the 120 together. Ten minutes leave room for the pages, the photos and
          // a 429 waited out. ADR-IMPL-067: twice a day, 07:40 and 19:40 UTC — a deal is served for a day after its
          // read, so one run that fails leaves the deals another twelve hours, and one run never ends a day's deals
          // before the next has written its own.
          // Longer than the worker's 120-s HTTP idle timeout: the cron's request is closed while the run goes on, and
          // platform.job_runs holds its outcome (as for `retention`).
          name: "sync-site-destinations",
          spec: {
            cron: "40 7,19 * * *",
            singleton: true,
            timeoutMs: 600_000,
            handler: async (ctx) => {
              const photos = await sitePhotos();
              // ADR-IMPL-067: the deals need the snapshot as the pins do, and neither needs the other. ADR-IMPL-068: the
              // globe's tap needs it too (what a tap may open is the site's cities).
              const snapshot =
                (await platform.flags.isEnabled("catalog.site_pins", false)) ||
                (await platform.flags.isEnabled("catalog.site_offers", false)) ||
                (await platform.flags.isEnabled("catalog.globe_tap", false));
              const report = await syncSite(
                {
                  db: conn,
                  site: {
                    fetch: opts.fetch ?? fetch,
                    userAgent: `BBCClub/1.0 (${env.APP_ORIGIN}; site destinations)`,
                    signal: (ctx as { signal?: AbortSignal }).signal ?? platform.signal,
                    clock: opts.siteClock,
                  },
                  logger: platform.logger,
                },
                { read: photos !== null || snapshot, photos },
              );
              if (report.read) await invalidateMaps();
              return report;
            },
          },
        },
        {
          // ADR-IMPL-063: the company's site's answers for the routes Home's site pins show, so a pin shows the site's
          // price without asking it. At most 150 questions a run, about two a second (75 s and more); it stops at the
          // site's first 429, when the breaker opens, or when one of its flags is turned off. Ten minutes apart, five
          // to finish. With estimates, the site's prices or the site's pins off, nothing is asked — and the expired
          // answers are still deleted, so none outlives its day once the feature is off.
          name: "refresh-site-prices",
          spec: {
            cron: "*/10 * * * *",
            singleton: true,
            timeoutMs: 300_000,
            handler: async (ctx) => {
              if (!(await refreshSitePricesOn())) {
                return { skipped: 1, purged: await sitePricesRepo.purgeExpired(conn) };
              }
              return refreshSitePrices({
                db: conn,
                client: sitePrices,
                clock: siteClock,
                signal: (ctx as { signal?: AbortSignal }).signal ?? platform.signal,
                metrics: platform.metrics,
                logger: platform.logger,
                stillOn: refreshSitePricesOn,
                failed: siteFailures,
              });
            },
          },
        },
        {
          // ADR-IMPL-043: ten due airports a minute — new ones first. Nothing due: one query, no request outside.
          name: "resolve-place-photos",
          spec: {
            cron: "* * * * *",
            singleton: true,
            timeoutMs: 50_000,
            handler: async (ctx) => {
              if (!(await placePhotosOn())) return { skipped: 1 };
              return resolvePlacePhotos({
                db: conn,
                sources: {
                  fetch: opts.fetch ?? fetch,
                  // Wikimedia's User-Agent policy: who is asking, and where to reach them.
                  userAgent: `BBCClub/1.0 (${env.APP_ORIGIN}; place photos)`,
                  signal: (ctx as { signal?: AbortSignal }).signal ?? platform.signal,
                },
                pexelsKey: env.PEXELS_API_KEY,
                metrics: platform.metrics,
                logger: platform.logger,
              });
            },
          },
        },
      ],
    };
  },
});
