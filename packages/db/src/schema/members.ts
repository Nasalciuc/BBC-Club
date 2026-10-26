import { pgSchema, text, jsonb, boolean, primaryKey, index, check, bytea, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt, tz } from "./_helpers";

export const members = pgSchema("members");

/** INVARIANTS IN THE DATABASE, not in TypeScript. */
export const memberStatus = members.enum("member_status", ["active", "waitlist", "deleted"]);
export const notificationCategory = members.enum("notification_category", [
  "transactional",
  "offers_personal",
  "offers_broadcast",
]);

export type TravelPreferences = {
  destinations?: string[]; // IATA city codes, max 3 (enforced at boundary by Zod)
  cabin?: "business" | "first";
  frequency?: "monthly" | "quarterly" | "rarely";
  passengers?: { adult: number; child: number; infant: number };
  notes?: string;
};

/** member_id = our own auth user id (Better Auth `auth.user.id`), NEVER a provider id.
 *  No FK across schemas: identity → members is linked by the member.registered event. */
export const profile = members.table(
  "profile",
  {
    memberId: text("member_id").primaryKey(),
    crmClientId: text("crm_client_id"), // opaque CRM key (crm.mirror), nullable until linked
    displayName: text("display_name"),
    phone: text("phone"),
    homeAirport: text("home_airport"), // IATA
    /** The member's photo (02, 12): the https address of an image hosted elsewhere, never the image; null — their
     *  initials shown — until they add one (ADR-IMPL-056). No route sets it yet. Added by the named step 0033. */
    avatarUrl: text("avatar_url"),
    preferences: jsonb("preferences").$type<TravelPreferences>().notNull().default({}),
    timezone: text("timezone").notNull().default("America/New_York"),
    status: memberStatus("status").notNull().default("waitlist"),
    linkedAt: tz("linked_at"), // when crm_client_id was set
    deletedAt: tz("deleted_at"), // soft-delete marker; purge job hard-deletes after 7 d
    memberSince: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("profile_crm_client")
      .on(t.crmClientId)
      .where(sql`${t.crmClientId} IS NOT NULL`),
    index("profile_status").on(t.status),
    index("profile_home_airport")
      .on(t.homeAirport)
      .where(sql`${t.homeAirport} IS NOT NULL`),
    check("profile_iata_len", sql`${t.homeAirport} IS NULL OR length(${t.homeAirport}) = 3`),
    // the "XOR law" done right: linked ⇔ crm_client_id present
    check("profile_linked_consistent", sql`(${t.crmClientId} IS NULL) = (${t.linkedAt} IS NULL)`),
    // deleted rows must carry a deleted_at (and vice versa)
    check("profile_deleted_consistent", sql`(${t.status} = 'deleted') = (${t.deletedAt} IS NOT NULL)`),
    // a photo is only ever an https address (0033)
    check("profile_avatar_url", sql`${t.avatarUrl} IS NULL OR ${t.avatarUrl} ~ '^https://'`),
  ],
);

/**
 * The photo the member added themselves (ADR-IMPL-070): the image itself, kept here and nowhere else — no object store,
 * no public address. A still WebP, 512 × 512, at most 100 KB, without metadata (`@bbc/shared/media/webp` checks it
 * before it is written); read only by its member, through GET /v1/profile/photo, whose ETag is `sha256`. One per
 * member, and it goes with the profile: deleting the profile (member.deleted) deletes it (FK, ON DELETE CASCADE).
 * Added by the named step 0043.
 */
export const profilePhoto = members.table(
  "profile_photo",
  {
    memberId: text("member_id")
      .primaryKey()
      .references(() => profile.memberId, { onDelete: "cascade" }),
    image: bytea("image").notNull(),
    byteSize: integer("byte_size").notNull(),
    /** The bytes' sha256 in hex: the ETag, and the app's cache key. Postgres computes it again on every write. */
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // 1 B to 100 KB, and the size stored is the bytes' own.
    check("profile_photo_size", sql`${t.byteSize} BETWEEN 1 AND 102400 AND octet_length(${t.image}) = ${t.byteSize}`),
    // A WebP's container: RIFF … WEBP.
    check(
      "profile_photo_webp",
      sql`substring(${t.image} from 1 for 4) = 'RIFF'::bytea AND substring(${t.image} from 9 for 4) = 'WEBP'::bytea`,
    ),
    // The tag is the bytes' own: an ETag can never describe another photo.
    check("profile_photo_sha256", sql`${t.sha256} = encode(sha256(${t.image}), 'hex')`),
  ],
);

export const notificationPreferences = members.table(
  "notification_preferences",
  {
    memberId: text("member_id").notNull(),
    category: notificationCategory("category").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.category] }),
    // transactional can never be disabled — Apple 4.5.4 covers marketing only
    check("prefs_transactional_always_on", sql`NOT (${t.category} = 'transactional' AND ${t.enabled} = false)`),
  ],
);
