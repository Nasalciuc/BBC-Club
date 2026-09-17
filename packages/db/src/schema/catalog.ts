import { pgSchema, text, char, numeric, integer, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
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

/** Airports for pins and autocomplete. OpenFlights subset; no created_at (static reference). */
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
  },
  (t) => [index("airports_city").on(t.city), index("airports_region").on(t.region)],
);
