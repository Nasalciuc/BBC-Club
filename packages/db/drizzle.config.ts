import { defineConfig } from "drizzle-kit";

/** One config for the whole monolith. Schemas live with their owning module; this glob
 *  finds them all so drizzle-kit sees every pgSchema in one snapshot (cross-schema FKs are
 *  forbidden by db:verify, not by drizzle-kit). */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/index.ts"],
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: undefined, // column names are explicit in every table — no casing magic
  strict: true,
  verbose: true,
  schemaFilter: [
    "platform",
    "auth",
    "members",
    "notifications",
    "proposals",
    "engagement",
    "crm",
    "personalization",
    "campaigns",
  ],
});
