import { pgSchema } from "drizzle-orm/pg-core";
/** One Postgres schema per module. Tables here are owned by proposals only; no FK may point across schemas. */
export const proposals = pgSchema("proposals");
