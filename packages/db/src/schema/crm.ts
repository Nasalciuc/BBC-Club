import { pgSchema, text, jsonb, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, tz } from "./_helpers";

export const crm = pgSchema("crm");
export const syncStatus = crm.enum("sync_status", ["running", "succeeded", "failed"]);

export type RouteHistory = { from: string; to: string; cabin?: string; flownAt: string; count?: number }[];

/** Read-only projection of the CRM. "CRM wins" on conflict; disposable; refreshed nightly + on demand. */
export const mirror = crm.table("mirror", {
  crmClientId: text("crm_client_id").primaryKey(),
  emailNormalized: text("email_normalized").notNull(),            // lower(trim(email)) — the join key at registration
  fullName: text("full_name"),
  phone: text("phone"),
  homeAirport: text("home_airport"),
  routeHistory: jsonb("route_history").$type<RouteHistory>().notNull().default([]),
  lastFlightAt: tz("last_flight_at"),
  advisorName: text("advisor_name"),                              // "Julia Reed"
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mirror_email").on(t.emailNormalized),
  index("mirror_last_flight").on(t.lastFlightAt),
  check("mirror_email_lower", sql`${t.emailNormalized} = lower(${t.emailNormalized})`),
]);

/** Every sync run is recorded: freshness (fresh/stale/unavailable) is derived from the last succeeded run. */
export const syncRuns = crm.table("sync_runs", {
  id: id(),
  startedAt: createdAt(),
  finishedAt: tz("finished_at"),
  status: syncStatus("status").notNull().default("running"),
  rowsUpserted: integer("rows_upserted"),
  error: text("error"),
}, (t) => [index("sync_runs_started").on(t.startedAt)]);
