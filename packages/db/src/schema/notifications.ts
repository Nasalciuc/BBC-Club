import { pgSchema, text, uuid, integer, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, tz } from "./_helpers";

export const notifications = pgSchema("notifications");

// Order is the database's: 0015 appended "sending" with ADD VALUE, so it sorts last (schema-parity.test.ts).
export const notificationStatus = notifications.enum("notification_status", [
  "pending",
  "sent",
  "delivered",
  "failed",
  "suppressed",
  "sending",
]);
export const notificationCategoryN = notifications.enum("notification_category", [
  "transactional",
  "offers_personal",
  "offers_broadcast",
]);
export const devicePlatform = notifications.enum("device_platform", ["ios", "android"]);
export const campaignStatus = notifications.enum("campaign_status", ["pending", "running", "done"]);

/** Inbox AND push queue in one table. Consumer of `offer.published` (idempotent via platform.event_inbox). */
export const notificationsTable = notifications.table(
  "notifications",
  {
    id: id(),
    memberId: text("member_id").notNull(), // opaque
    category: notificationCategoryN("category").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    deepLink: text("deep_link"), // bbcclub://proposal/<id>
    offerId: uuid("offer_id"), // opaque, no FK across schemas
    requestId: uuid("request_id"),
    sourceEventId: text("source_event_id"), // journal id that created it (dedupe/debug)
    status: notificationStatus("status").notNull().default("pending"),
    claimedAt: tz("claimed_at"),
    scheduledFor: tz("scheduled_for").notNull().defaultNow(), // quiet hours push it forward
    attempts: integer("attempts").notNull().default(0),
    ticketId: text("ticket_id"), // provider message id
    lastError: text("last_error"),
    sentAt: tz("sent_at"),
    deliveredAt: tz("delivered_at"),
    readAt: tz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    // dispatcher: the only hot query — pending rows due now
    index("notif_dispatch")
      .on(t.scheduledFor, t.category)
      .where(sql`${t.status} = 'pending'`),
    index("notif_sending_claimed")
      .on(t.claimedAt)
      .where(sql`${t.status} = 'sending'`),
    // inbox: newest first per member; badge = unread count
    index("notif_inbox").on(t.memberId, t.createdAt),
    index("notif_unread")
      .on(t.memberId)
      .where(sql`${t.readAt} IS NULL`),
    index("notif_offer")
      .on(t.offerId)
      .where(sql`${t.offerId} IS NOT NULL`),
    // one notification per (member, offer, category): a retried publish cannot double-notify
    uniqueIndex("notif_member_offer_cat")
      .on(t.memberId, t.offerId, t.category)
      .where(sql`${t.offerId} IS NOT NULL`),
    uniqueIndex("notif_member_request_cat")
      .on(t.memberId, t.requestId, t.category)
      .where(sql`${t.requestId} IS NOT NULL`),
    index("notif_request")
      .on(t.requestId)
      .where(sql`${t.requestId} IS NOT NULL`),
    check("notif_attempts_nonneg", sql`${t.attempts} >= 0`),
    check("notif_sent_has_ticket_or_error", sql`${t.status} <> 'failed' OR ${t.lastError} IS NOT NULL`),
  ],
);

export const deviceTokens = notifications.table(
  "device_tokens",
  {
    id: id(),
    memberId: text("member_id").notNull(),
    deviceId: text("device_id").notNull(), // stable per install
    platform: devicePlatform("platform").notNull(),
    nativeToken: text("native_token").notNull(), // APNs / FCM — primary
    expoToken: text("expo_token"), // optional
    appVersion: text("app_version"),
    active: boolean("active").notNull().default(true),
    deactivatedReason: text("deactivated_reason"), // "Unregistered" | "BadDeviceToken" | "logout"
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("device_member_device").on(t.memberId, t.deviceId),
    uniqueIndex("device_native_token").on(t.nativeToken),
    index("device_active_by_member")
      .on(t.memberId)
      .where(sql`${t.active}`),
    index("device_last_seen").on(t.lastSeenAt), // cleanup: inactive > 180 d
  ],
);

/** One row per broadcast offer (0018). The delivery only records it; the campaign-fanout job pages through the
 *  audience and advances `last_member_id`, so a crash resumes after the last committed page. */
export const campaigns = notifications.table(
  "campaigns",
  {
    id: id(),
    offerId: uuid("offer_id").notNull(), // opaque, no FK across schemas
    // a re-delivered event cannot start a second campaign
    sourceEventId: text("source_event_id").notNull().unique("campaigns_source_event_id_key"),
    category: notificationCategoryN("category").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    deepLink: text("deep_link"),
    lastMemberId: text("last_member_id"), // keyset cursor
    status: campaignStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    finishedAt: tz("finished_at"),
  },
  (t) => [
    index("campaigns_offer").on(t.offerId),
    // claim order; the cursor rides along because db:verify §3 indexes every *_id column
    index("campaigns_open")
      .on(t.createdAt, t.lastMemberId)
      .where(sql`${t.status} IN ('pending', 'running')`),
    check("campaigns_finished_consistent", sql`(${t.status} = 'done') = (${t.finishedAt} IS NOT NULL)`),
  ],
);
