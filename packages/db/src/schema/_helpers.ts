import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

// ── shared column helpers (one definition, every table) ─────────────────────
export const id = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// NOTE: $onUpdate only fires through Drizzle; migration 0001 also installs a
// DB trigger (set_updated_at) on every table that has this column, so raw SQL
// and psql edits cannot leave updated_at stale.
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const tz = (name: string) => timestamp(name, { withTimezone: true });
export const nowSql = sql`now()`;
