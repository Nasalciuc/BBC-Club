import { eq } from "drizzle-orm";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { profile, notificationPreferences } from "@bbc/db/schema/members";

/** Hard-delete the member's profile + prefs. Tombstone runs in a later consumer so siblings still see the payload. */
export async function onMemberDeleted(
  deps: {
    tx: any;
  },
  raw: unknown,
) {
  const evt = MemberDeletedV1.parse(raw);
  await deps.tx.delete(profile).where(eq(profile.memberId, evt.memberId));
  await deps.tx.delete(notificationPreferences).where(eq(notificationPreferences.memberId, evt.memberId));
}
