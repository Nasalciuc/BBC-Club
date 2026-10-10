import {
  pgSchema,
  text,
  char,
  numeric,
  integer,
  boolean,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, tz } from "./_helpers";

export const catalog = pgSchema("catalog");
export const fareCabin = catalog.enum("fare_cabin", ["business", "first"]);
export const fareSource = catalog.enum("fare_source", ["manual", "import", "gds"]);

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
    source: fareSource("source").notNull().default("import"),
    validFrom: tz("valid_from").notNull().defaultNow(),
    validUntil: tz("valid_until").notNull(),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("fares_route_cabin_carrier").on(t.routeFrom, t.routeTo, t.cabin, t.carrier, t.validFrom),
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
    createdAt: createdAt(),
  },
  (t) => [index("airports_city").on(t.city), index("airports_region").on(t.region)],
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
