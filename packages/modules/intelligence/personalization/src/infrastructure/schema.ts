import { pgSchema } from "drizzle-orm/pg-core";
/** One Postgres schema per module. Tables live in packages/db/src/schema/personalization.ts. */
export const personalization = pgSchema("personalization");
