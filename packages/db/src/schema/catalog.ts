import {
  pgSchema,
  text,
  char,
  numeric,
  integer,
  boolean,
  index,
  unique,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, tz } from "./_helpers";

export const catalog = pgSchema("catalog");
export const fareCabin = catalog.enum("fare_cabin", ["business", "first"]);
export const fareSource = catalog.enum("fare_source", ["manual", "import", "gds"]);
/** The trip a fare's price is for (ADR-IMPL-056): one way unless the catalogue says the price is for the round trip. */
export const fareTrip = catalog.enum("fare_trip", ["round_trip", "one_way"]);

/** A published fare for a route. Distinct from proposals.offers (promotional). */
export const fares = catalog.table(
  "fares",
  {
    id: id(),
    routeFrom: char("route_from", { length: 3 }).notNull(),
    routeTo: char("route_to", { length: 3 }).notNull(),
    cabin: fareCabin("cabin").notNull(),
    carrier: char("carrier", { length: 2 }),
    carrierName: text("carrier_name"),
    product: text("product"),
    nonstop: boolean("nonstop").notNull().default(true),
    durationMinutes: integer("duration_minutes"),
    departAt: tz("depart_at"),
    arriveAt: tz("arrive_at"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    publishedPrice: numeric("published_price", { precision: 10, scale: 2 }),
    publishedSource: text("published_source"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    /** What the price is for: `round_trip` only when the catalogue says so (04 and 13 print `round trip` beside a
     *  fare), else one way. Added by the named step 0031, not by a drizzle migration. */
    trip: fareTrip("trip").notNull().default("one_way"),
    source: fareSource("source").notNull().default("import"),
    validFrom: tz("valid_from").notNull().defaultNow(),
    validUntil: tz("valid_until").notNull(),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One fare per route, cabin, carrier, valid_from and trip; a fare without a carrier is one too (NULLS NOT
     *  DISTINCT) — the import's ON CONFLICT target. A constraint since 0034 (0006 made it an index without the trip). */
    unique("fares_route_cabin_carrier")
      .on(t.routeFrom, t.routeTo, t.cabin, t.carrier, t.validFrom, t.trip)
      .nullsNotDistinct(),
    index("fares_search")
      .on(t.routeFrom, t.routeTo, t.cabin)
      .where(sql`${t.published} = true`),
    index("fares_expiry")
      .on(t.validUntil)
      .where(sql`${t.published} = true`),
    index("fares_destinations")
      .on(t.routeTo)
      .where(sql`${t.published} = true`),
    index("fares_home_destinations")
      .on(t.routeFrom, t.routeTo, t.price)
      .where(sql`${t.published} = true`),
    check("fares_price_pos", sql`${t.price} > 0`),
    check("fares_published_gte_price", sql`${t.publishedPrice} IS NULL OR ${t.publishedPrice} >= ${t.price}`),
    check("fares_valid_range", sql`${t.validUntil} > ${t.validFrom}`),
    check(
      "fares_iata",
      sql`length(${t.routeFrom}) = 3 AND length(${t.routeTo}) = 3 AND ${t.routeFrom} <> ${t.routeTo}`,
    ),
    check("fares_published_has_source", sql`${t.publishedPrice} IS NULL OR ${t.publishedSource} IS NOT NULL`),
    // Whole minutes above zero or none, as FareVM reads it (0035).
    check("fares_duration_pos", sql`${t.durationMinutes} IS NULL OR ${t.durationMinutes} > 0`),
  ],
);

/** Daily search demand. No member id. JSON routes use from/to; the columns are route_from/route_to. */
export const demandDaily = catalog.table(
  "demand_daily",
  {
    day: tz("day").notNull(),
    routeFrom: char("route_from", { length: 3 }).notNull(),
    routeTo: char("route_to", { length: 3 }).notNull(),
    cabin: fareCabin("cabin").notNull(),
    searches: integer("searches").notNull(),
    searchesWithoutFare: integer("searches_without_fare").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.routeFrom, t.routeTo, t.cabin] }),
    check("demand_daily_counts_nonneg", sql`${t.searches} >= 0 AND ${t.searchesWithoutFare} >= 0`),
    check("demand_daily_nofare_lte", sql`${t.searchesWithoutFare} <= ${t.searches}`),
  ],
);

/** Airports for pins and autocomplete. OpenFlights subset. */
export const airports = catalog.table(
  "airports",
  {
    code: char("code", { length: 3 }).primaryKey(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    region: text("region").notNull(),
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    popularity: integer("popularity").notNull().default(0),
    tz: text("tz").notNull().default("UTC"),
    /** Other names a member may type: metro and former codes (LON, KIV), the town it sits in. Search only. */
    searchTerms: text("search_terms"),
    /** Lower-case, accent-free copies for search, written only by the airports_normalize trigger (0023). Never set them. */
    cityNorm: text("city_norm"),
    nameNorm: text("name_norm"),
    countryNorm: text("country_norm"),
    termsNorm: text("terms_norm"),
    /** The destination's one line under its city (04: `Iconic sights, world-class culture and unforgettable
     *  experiences.`), from the airports import; null until it has one (ADR-IMPL-056). Added by the named step 0031. */
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [
    index("airports_city").on(t.city),
    index("airports_region").on(t.region),
    check("airports_description", sql`${t.description} IS NULL OR length(btrim(${t.description})) BETWEEN 1 AND 160`),
    // On the globe (0035).
    check("airports_coordinates", sql`${t.lat} BETWEEN -90 AND 90 AND ${t.lng} BETWEEN -180 AND 180`),
  ],
);

/** What a place photo is now (ADR-IMPL-043): not looked at yet, a photo, or only coordinates to draw from above. */
export const placePhotoStatus = catalog.enum("place_photo_status", ["pending", "photo", "satellite"]);
/** Where a photo comes from: Wikimedia Commons (through Wikidata), Pexels, or an operator's own choice. */
export const placePhotoSource = catalog.enum("place_photo_source", ["wikimedia", "pexels", "override"]);

/**
 * The photo the app shows for the city an airport serves (ADR-IMPL-043) — the address of an image hosted elsewhere,
 * never the image. One row per airport the app asked about. `pending` until the resolve-place-photos job looks; then a
 * photo with its credit, or the coordinates the app draws from Mapbox's satellite imagery. A row is looked at again
 * when it expires; an operator's own photo never expires. Created by 0026_catalog_place_photos.sql (after 0006).
 */
export const placePhotos = catalog.table(
  "place_photos",
  {
    code: char("code", { length: 3 })
      .primaryKey()
      .references(() => airports.code, { onDelete: "cascade" }),
    status: placePhotoStatus("status").notNull().default("pending"),
    /** Set exactly when there is a photo. */
    source: placePhotoSource("source"),
    /** For a card: 500 px wide from Commons, 940 from Pexels. */
    cardUrl: text("card_url"),
    /** For a full-width photograph: 1280 px wide from Commons, 1880 from Pexels. */
    heroUrl: text("hero_url"),
    author: text("author"),
    license: text("license"),
    /** The photo's own page: its author, its licence, the original. An operator's photo may have none. */
    link: text("link"),
    /** Where the satellite view is centred: the city, else the airport. */
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    /** Looks since the last one that answered; spaces out the next look after a failure. */
    attempts: integer("attempts").notNull().default(0),
    resolvedAt: tz("resolved_at"),
    /** When the job looks again: a new row is due at once; an operator's photo, never ('infinity'). */
    expiresAt: tz("expires_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("place_photos_due").on(t.expiresAt),
    check("place_photos_source", sql`(${t.status} = 'photo') = (${t.source} IS NOT NULL)`),
    check(
      "place_photos_photo",
      sql`${t.status} <> 'photo' OR (${t.cardUrl} IS NOT NULL AND ${t.heroUrl} IS NOT NULL AND (${t.link} IS NOT NULL OR ${t.source} = 'override'))`,
    ),
    check(
      "place_photos_satellite",
      sql`${t.status} <> 'satellite' OR (${t.lat} IS NOT NULL AND ${t.lng} IS NOT NULL AND ${t.lat} BETWEEN -90 AND 90 AND ${t.lng} BETWEEN -180 AND 180)`,
    ),
    check(
      "place_photos_https",
      sql`(${t.cardUrl} IS NULL OR ${t.cardUrl} LIKE 'https://%') AND (${t.heroUrl} IS NULL OR ${t.heroUrl} LIKE 'https://%') AND (${t.link} IS NULL OR ${t.link} LIKE 'https://%')`,
    ),
    check("place_photos_attempts", sql`${t.attempts} >= 0`),
  ],
);

/**
 * The cities the company's site sells (ADR-IMPL-045), as the sync-site-destinations job read them last: each city's
 * airports, its photo's address on the site, whether the site's home page shows it. A snapshot the job replaces whole,
 * in one transaction. Created by 0028_catalog_site_destinations.sql (after 0006).
 */
export const sitePlaces = catalog.table(
  "site_places",
  {
    /** The site's own id for the city: its page is /flight/city/<name>/<id>. */
    cmsId: integer("cms_id").primaryKey(),
    name: text("name").notNull(),
    /** The site's country and region, as the site names them. */
    country: text("country").notNull(),
    region: text("region").notNull(),
    /** The city's main airport: the one its pin stands on. */
    airport: char("airport", { length: 3 })
      .notNull()
      .references(() => airports.code, { onDelete: "cascade" }),
    /** Every airport the city's photo goes on, the main one included. */
    airports: char("airports", { length: 3 }).array().notNull(),
    /** On the site's home page. */
    promoted: boolean("promoted").notNull().default(false),
    /** `bestDeals/<id>/image/<file>` when the city's photo is its own and answers; null otherwise. */
    image: text("image"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("site_places_airport").on(t.airport),
    check("site_places_cms_id", sql`${t.cmsId} > 0`),
    check("site_places_main_airport", sql`${t.airport} = ANY (${t.airports})`),
    check(
      "site_places_image",
      sql`${t.image} IS NULL OR ${t.image} ~* '^bestDeals/[0-9]+/image/[a-z0-9._-]+\\.(jpe?g|png|webp)$'`,
    ),
  ],
);

/**
 * The US airports the site lists a price from for each of its cities (ADR-IMPL-045): New York's deal for London is
 * three rows, JFK, EWR and LGA. A pin is priced by the formula (ADR-IMPL-037); with `catalog.site_offers` on, Home's
 * "Offers to inspire" shows `price` as the site's deal, `from $X` — never `published_price`, which has no source
 * (ADR-IMPL-067). A row is served until `valid_until`, at most 24 hours after the read that wrote it (D6, CHECK).
 * Created by 0028_catalog_site_destinations.sql; `valid_until` by 0042_catalog_site_route_validity.sql.
 */
export const siteRoutes = catalog.table(
  "site_routes",
  {
    routeFrom: char("route_from", { length: 3 })
      .notNull()
      .references(() => airports.code, { onDelete: "cascade" }),
    cmsId: integer("cms_id")
      .notNull()
      .references(() => sitePlaces.cmsId, { onDelete: "cascade" }),
    /** The site's own id for this price: one bestDeals entry of the city's page. */
    deal: integer("deal").notNull(),
    /** The site's "Price Today" and "Old Price", whole USD. */
    price: integer("price").notNull(),
    publishedPrice: integer("published_price"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
    /** Not served from this moment on: the read's time + 24 hours, as the sync writes it (ADR-IMPL-067, D6). */
    validUntil: tz("valid_until")
      .notNull()
      .default(sql`(now() + interval '24 hours')`),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.routeFrom, t.cmsId] }),
    index("site_routes_cms_id").on(t.cmsId),
    check("site_routes_deal", sql`${t.deal} > 0`),
    check("site_routes_price", sql`${t.price} > 0`),
    check("site_routes_published_price", sql`${t.publishedPrice} IS NULL OR ${t.publishedPrice} > 0`),
    // D6: a deal is shown for at most 24 hours after the site was read.
    check(
      "site_routes_validity",
      sql`${t.validUntil} > ${t.syncedAt} AND ${t.validUntil} <= ${t.syncedAt} + interval '24 hours'`,
    ),
  ],
);

/** What the company's site said about a route (ADR-IMPL-063): its prices, or that it has none. */
export const sitePriceStatus = catalog.enum("site_price_status", ["priced", "none"]);

/**
 * The company's site's own answer for a route and trip (ADR-IMPL-063): whole USD per person in each cabin, or `none` —
 * the company has no price there (the site answered 404), so the member sees no number at all. Written by the search's
 * one live call and by the refresh-site-prices job, never on an error; read by the search, Home's site pins and a quote
 * request. A row is shown only until it expires, at most 24 hours after the site was asked (CHECK). Created by
 * 0038_catalog_site_prices.sql (after 0006).
 */
export const sitePrices = catalog.table(
  "site_prices",
  {
    routeFrom: char("route_from", { length: 3 }).notNull(),
    routeTo: char("route_to", { length: 3 }).notNull(),
    trip: fareTrip("trip").notNull(),
    status: sitePriceStatus("status").notNull(),
    /** The site's figures, whole USD per person; null on a `none` row. Premium economy is kept, never shown. */
    business: integer("business"),
    first: integer("first"),
    premiumEconomy: integer("premium_economy"),
    /** When the site answered. */
    fetchedAt: tz("fetched_at").notNull().defaultNow(),
    /** Not shown from this moment on: at most 24 hours after `fetched_at`. */
    expiresAt: tz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.routeFrom, t.routeTo, t.trip] }),
    // The job's questions: what is due for a refresh, and what has expired.
    index("site_prices_due").on(t.expiresAt),
    // The site prices JFK → JFK; the club never asks, and never stores it.
    check("site_prices_route", sql`${t.routeFrom} <> ${t.routeTo}`),
    // A priced row has its business figure; a `none` row has no figure at all.
    check(
      "site_prices_status",
      sql`(${t.status} = 'priced' AND ${t.business} IS NOT NULL) OR (${t.status} = 'none' AND ${t.business} IS NULL AND ${t.first} IS NULL AND ${t.premiumEconomy} IS NULL)`,
    ),
    check(
      "site_prices_amounts",
      sql`(${t.business} IS NULL OR ${t.business} > 0) AND (${t.first} IS NULL OR ${t.first} > 0) AND (${t.premiumEconomy} IS NULL OR ${t.premiumEconomy} > 0)`,
    ),
    // D6: a price older than 24 hours is never shown.
    check(
      "site_prices_expiry",
      sql`${t.expiresAt} > ${t.fetchedAt} AND ${t.expiresAt} <= ${t.fetchedAt} + interval '24 hours'`,
    ),
  ],
);

/** What a landmark row is (ADR-IMPL-064): a landmark at its rank; `fewer` — the job looked and found fewer than three
 *  (the marker sits right after the last one found); `failed` — a place never looked at successfully. */
export const placeLandmarkKind = catalog.enum("place_landmark_kind", ["landmark", "fewer", "failed"]);
/** The outside sources a Wikimedia job asks and that may answer 429: the Wikidata Query Service and Commons' API. */
export const outsideSource = catalog.enum("outside_source", ["wikidata", "commons"]);

/**
 * Up to three landmarks of the city each airport serves (ADR-IMPL-064) — the address of each one's photograph on
 * Wikimedia Commons with its credit, never the image. Rows per place: ranks 1–3 best first, and a marker after the last
 * one found when there are fewer than three (`fewer`), or alone at rank 1 when no look has worked yet (`failed`). The
 * resolve-place-landmarks job writes them; a place is looked at again when its rows expire. Created by
 * 0039_catalog_place_landmarks.sql (after 0006).
 */
export const placeLandmarks = catalog.table(
  "place_landmarks",
  {
    /** The airport the app asks with. */
    code: char("code", { length: 3 })
      .notNull()
      .references(() => airports.code, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    kind: placeLandmarkKind("kind").notNull(),
    /** The city's Wikidata item; null only on a marker for a place whose city was not found. */
    cityQid: text("city_qid"),
    landmarkQid: text("landmark_qid"),
    name: text("name"),
    /** The Commons file the photograph is. */
    file: text("file"),
    /** Its 1280-px thumbnail on Wikimedia, and that thumbnail's size. */
    imageUrl: text("image_url"),
    width: integer("width"),
    height: integer("height"),
    licence: text("licence"),
    licenceUrl: text("licence_url"),
    /** Who to credit, as the app prints it before the licence. */
    credit: text("credit"),
    fetchedAt: tz("fetched_at").notNull().defaultNow(),
    /** When the job looks again: a month after a look, six hours after a failed first one. */
    expiresAt: tz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.code, t.rank] }),
    uniqueIndex("place_landmarks_one_marker")
      .on(t.code)
      .where(sql`${t.kind} <> 'landmark'`),
    check("place_landmarks_rank", sql`${t.rank} BETWEEN 1 AND 3`),
    check(
      "place_landmarks_landmark",
      sql`${t.kind} <> 'landmark' OR (${t.cityQid} IS NOT NULL AND ${t.landmarkQid} IS NOT NULL AND ${t.name} IS NOT NULL AND ${t.file} IS NOT NULL AND ${t.imageUrl} IS NOT NULL AND ${t.width} IS NOT NULL AND ${t.height} IS NOT NULL AND ${t.licence} IS NOT NULL AND ${t.credit} IS NOT NULL)`,
    ),
    check(
      "place_landmarks_marker",
      sql`${t.kind} = 'landmark' OR (${t.landmarkQid} IS NULL AND ${t.name} IS NULL AND ${t.file} IS NULL AND ${t.imageUrl} IS NULL AND ${t.width} IS NULL AND ${t.height} IS NULL AND ${t.licence} IS NULL AND ${t.licenceUrl} IS NULL AND ${t.credit} IS NULL)`,
    ),
    check("place_landmarks_failed", sql`${t.kind} <> 'failed' OR ${t.rank} = 1`),
    check(
      "place_landmarks_size",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`,
    ),
    check(
      "place_landmarks_https",
      sql`(${t.imageUrl} IS NULL OR ${t.imageUrl} LIKE 'https://%') AND (${t.licenceUrl} IS NULL OR ${t.licenceUrl} LIKE 'https://%')`,
    ),
    check(
      "place_landmarks_qids",
      sql`(${t.cityQid} IS NULL OR ${t.cityQid} ~ '^Q[1-9][0-9]*$') AND (${t.landmarkQid} IS NULL OR ${t.landmarkQid} ~ '^Q[1-9][0-9]*$')`,
    ),
    check("place_landmarks_expiry", sql`${t.expiresAt} > ${t.fetchedAt}`),
  ],
);

/**
 * An outside source that answered 429 (ADR-IMPL-064): until `not_before` (its Retry-After) neither resolve-place-photos
 * nor resolve-place-landmarks asks it anything. One row a source, moved forward by each 429. Created by 0039.
 */
export const sourceHolds = catalog.table("source_holds", {
  source: outsideSource("source").primaryKey(),
  notBefore: tz("not_before").notNull(),
  createdAt: createdAt(),
});
