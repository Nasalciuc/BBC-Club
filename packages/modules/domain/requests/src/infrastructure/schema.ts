import { pgSchema } from "drizzle-orm/pg-core";
/** Ownership marker — tables live in @bbc/db/schema/requests. */
export const requests = pgSchema("requests");
