-- Expand-only: home destinations DISTINCT ON (route_from, route_to, price) for published fares.
CREATE INDEX IF NOT EXISTS "fares_home_destinations" ON "catalog"."fares" ("route_from", "route_to", "price") WHERE "published" = true;
