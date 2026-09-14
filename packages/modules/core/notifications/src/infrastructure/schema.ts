import { pgSchema } from "drizzle-orm/pg-core";
/** One Postgres schema per module. Tables here are owned by notifications only; no FK may point across schemas. */
export const notifications = pgSchema("notifications");
