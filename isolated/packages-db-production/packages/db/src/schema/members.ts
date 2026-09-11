import { pgSchema, text, jsonb, boolean, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt, tz } from "./_helpers";

export const members = pgSchema("members");

/** INVARIANTS IN THE DATABASE, not in TypeScript. */
export const memberStatus = members.enum("member_status", ["active", "waitlist", "deleted"]);
export const notificationCategory = members.enum("notification_category", [
  "transactional", "offers_personal", "offers_broadcast",
]);

export type TravelPreferences = {
  destinations?: string[];          // IATA city codes, max 3 (enforced at boundary by Zod)
  cabin?: "business" | "first";
  frequency?: "monthly" | "quarterly" | "rarely";
  notes?: string;
};

/** member_id = our own auth user id (Better Auth `auth.user.id`), NEVER a provider id.
 *  No FK across schemas: identity → members is linked by the member.registered event. */
export const profile = members.table("profile", {
  memberId: text("member_id").primaryKey(),
  crmClientId: text("crm_client_id"),                             // opaque CRM key (crm.mirror), nullable until linked
  displayName: text("display_name"),
  phone: text("phone"),
  homeAirport: text("home_airport"),                              // IATA
  preferences: jsonb("preferences").$type<TravelPreferences>().notNull().default({}),
  timezone: text("timezone").notNull().default("America/New_York"),
  status: memberStatus("status").notNull().default("waitlist"),
  linkedAt: tz("linked_at"),                                      // when crm_client_id was set
  deletedAt: tz("deleted_at"),                                    // soft-delete marker; purge job hard-deletes after 7 d
  memberSince: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("profile_crm_client").on(t.crmClientId).where(sql`${t.crmClientId} IS NOT NULL`),
  index("profile_status").on(t.status),
  index("profile_home_airport").on(t.homeAirport).where(sql`${t.homeAirport} IS NOT NULL`),
  check("profile_iata_len", sql`${t.homeAirport} IS NULL OR length(${t.homeAirport}) = 3`),
  // the "XOR law" done right: linked ⇔ crm_client_id present
  check("profile_linked_consistent", sql`(${t.crmClientId} IS NULL) = (${t.linkedAt} IS NULL)`),
  // deleted rows must carry a deleted_at (and vice versa)
  check("profile_deleted_consistent", sql`(${t.status} = 'deleted') = (${t.deletedAt} IS NOT NULL)`),
]);

export const notificationPreferences = members.table("notification_preferences", {
  memberId: text("member_id").notNull(),
  category: notificationCategory("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.memberId, t.category] }),
  // transactional can never be disabled — Apple 4.5.4 covers marketing only
  check("prefs_transactional_always_on", sql`NOT (${t.category} = 'transactional' AND ${t.enabled} = false)`),
]);
