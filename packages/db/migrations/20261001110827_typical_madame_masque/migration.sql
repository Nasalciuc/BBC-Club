CREATE SCHEMA IF NOT EXISTS "catalog";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "catalog"."fare_cabin" AS ENUM('business', 'first');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."demand_daily" (
  "day" timestamp with time zone NOT NULL,
  "route_from" char(3) NOT NULL,
  "route_to" char(3) NOT NULL,
  "cabin" "catalog"."fare_cabin" NOT NULL,
  "searches" integer NOT NULL,
  "searches_without_fare" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "demand_daily_pkey" PRIMARY KEY("day","route_from","route_to","cabin"),
  CONSTRAINT "demand_daily_counts_nonneg" CHECK ("searches" >= 0 AND "searches_without_fare" >= 0),
  CONSTRAINT "demand_daily_nofare_lte" CHECK ("searches_without_fare" <= "searches")
);
