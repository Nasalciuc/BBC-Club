import { sql } from "drizzle-orm";
import { OfferPublishedV1 } from "@bbc/shared/events/offer";
import { scheduleAfterQuietHours } from "../application/quiet-hours";

export type MembersPort = {
  activeMemberIds(exec?: unknown): Promise<string[]>;
  preferencesOf(exec: unknown, memberId: string): Promise<{ offers_personal: boolean; offers_broadcast: boolean }>;
  timezoneOf(exec: unknown, memberId: string): Promise<string>;
  getStatus(exec: unknown, memberId: string): Promise<"active" | "waitlist" | "deleted" | "pending">;
};

/** Fan-out `offer.published` → one pending inbox/push row per eligible member.
 *  Idempotent via UNIQUE (member_id, offer_id, category) + ON CONFLICT DO NOTHING. */
export async function onOfferPublished(
  deps: {
    tx: any;
    members: MembersPort;
    sourceEventId: string;
  },
  raw: unknown,
): Promise<void> {
  const evt = OfferPublishedV1.parse(raw);
  const category = evt.targeting === "user" ? "offers_personal" : "offers_broadcast";

  let candidates: string[] = [];
  if (evt.targeting === "user") {
    if (!evt.targetMemberId) return;
    const status = await deps.members.getStatus(deps.tx, evt.targetMemberId);
    if (status !== "active") return;
    const prefs = await deps.members.preferencesOf(deps.tx, evt.targetMemberId);
    if (!prefs.offers_personal) return;
    candidates = [evt.targetMemberId];
  } else if (evt.targeting === "broadcast") {
    const active = await deps.members.activeMemberIds(deps.tx);
    for (const memberId of active) {
      const prefs = await deps.members.preferencesOf(deps.tx, memberId);
      if (prefs.offers_broadcast) candidates.push(memberId);
    }
  } else {
    // segment: targets live in proposals.offer_targets — core cannot JOIN across schemas.
    // Campaigns (later) will publish per-member or carry ids in the payload.
    return;
  }

  const now = new Date();
  for (const memberId of candidates) {
    // Cap: at most one offer push per member per local calendar day (enqueue-time check).
    const alreadyToday: any[] = await deps.tx.execute(sql`
      SELECT 1 FROM notifications.notifications
      WHERE member_id = ${memberId}
        AND category IN ('offers_personal', 'offers_broadcast')
        AND created_at >= date_trunc('day', now())
      LIMIT 1`);
    if (alreadyToday.length > 0) continue;

    const tz = await deps.members.timezoneOf(deps.tx, memberId);
    const scheduledFor = scheduleAfterQuietHours(now, tz).toISOString();
    const body = `${evt.routeFrom} → ${evt.routeTo}`;
    const deepLink = `bbcclub://proposal/${evt.offerId}`;

    // Partial unique index: ON CONFLICT must name the same columns + WHERE offer_id IS NOT NULL.
    await deps.tx.execute(sql`
      INSERT INTO notifications.notifications
        (member_id, category, title, body, deep_link, offer_id, source_event_id, status, scheduled_for)
      VALUES
        (${memberId}, ${category}, ${evt.title}, ${body}, ${deepLink}, ${evt.offerId}::uuid,
         ${deps.sourceEventId}, 'pending', ${scheduledFor}::timestamptz)
      ON CONFLICT (member_id, offer_id, category) WHERE offer_id IS NOT NULL
      DO NOTHING`);
  }
}
