import { pgSchema, text, uuid, integer, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, tz } from "./_helpers";

export const notifications = pgSchema("notifications");

export const notificationStatus = notifications.enum("notification_status", [
  "pending", "sent", "delivered", "failed", "suppressed",
]);
export const notificationCategoryN = notifications.enum("notification_category", [
  "transactional", "offers_personal", "offers_broadcast",
]);
export const devicePlatform = notifications.enum("device_platform", ["ios", "android"]);

/** Inbox AND push queue in one table. Consumer of `offer.published` (idempotent via platform.event_inbox). */
export const notificationsTable = notifications.table("notifications", {
  id: id(),
  memberId: text("member_id").notNull(),                          // opaque
  category: notificationCategoryN("category").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  deepLink: text("deep_link"),                                    // bbcclub://proposal/<id>
  offerId: uuid("offer_id"),                                      // opaque, no FK across schemas
  sourceEventId: text("source_event_id"),                         // journal id that created it (dedupe/debug)
  status: notificationStatus("status").notNull().default("pending"),
  scheduledFor: tz("scheduled_for").notNull().defaultNow(),       // quiet hours push it forward
  attempts: integer("attempts").notNull().default(0),
  ticketId: text("ticket_id"),                                    // provider message id
  lastError: text("last_error"),
  sentAt: tz("sent_at"),
  deliveredAt: tz("delivered_at"),
  readAt: tz("read_at"),
  createdAt: createdAt(),
}, (t) => [
  // dispatcher: the only hot query — pending rows due now
  index("notif_dispatch").on(t.scheduledFor, t.category).where(sql`${t.status} = 'pending'`),
  // inbox: newest first per member; badge = unread count
  index("notif_inbox").on(t.memberId, t.createdAt),
  index("notif_unread").on(t.memberId).where(sql`${t.readAt} IS NULL`),
  index("notif_offer").on(t.offerId).where(sql`${t.offerId} IS NOT NULL`),
  // one notification per (member, offer, category): a retried publish cannot double-notify
  uniqueIndex("notif_member_offer_cat").on(t.memberId, t.offerId, t.category).where(sql`${t.offerId} IS NOT NULL`),
  check("notif_attempts_nonneg", sql`${t.attempts} >= 0`),
  check("notif_sent_has_ticket_or_error", sql`${t.status} <> 'failed' OR ${t.lastError} IS NOT NULL`),
]);

export const deviceTokens = notifications.table("device_tokens", {
  id: id(),
  memberId: text("member_id").notNull(),
  deviceId: text("device_id").notNull(),                          // stable per install
  platform: devicePlatform("platform").notNull(),
  nativeToken: text("native_token").notNull(),                    // APNs / FCM — primary
  expoToken: text("expo_token"),                                  // optional
  appVersion: text("app_version"),
  active: boolean("active").notNull().default(true),
  deactivatedReason: text("deactivated_reason"),                  // "Unregistered" | "BadDeviceToken" | "logout"
  lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("device_member_device").on(t.memberId, t.deviceId),
  uniqueIndex("device_native_token").on(t.nativeToken),
  index("device_active_by_member").on(t.memberId).where(sql`${t.active}`),
  index("device_last_seen").on(t.lastSeenAt),                     // cleanup: inactive > 180 d
]);
