import { pgSchema } from "drizzle-orm/pg-core";
/** One Postgres schema per module. Tables live in packages/db/src/schema/catalog.ts. */
export const catalog = pgSchema("catalog");
