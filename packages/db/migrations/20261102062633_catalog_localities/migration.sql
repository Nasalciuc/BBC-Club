-- catalog.localities (ADR-IMPL-083): the towns and cities a tap on the globe is named by — GeoNames' places of 5,000
-- people or more, loaded by migrate.ts from seeds/localities-reference.tsv after this file. Reference data, kept whole.
CREATE TABLE "catalog"."localities" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"population" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localities_name" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
	CONSTRAINT "localities_coordinates" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180),
	CONSTRAINT "localities_population" CHECK ("population" >= 0)
);
--> statement-breakpoint
CREATE INDEX "localities_lat" ON "catalog"."localities" ("lat");