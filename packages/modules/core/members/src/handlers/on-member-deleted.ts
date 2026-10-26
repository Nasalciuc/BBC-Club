import { eq } from "drizzle-orm";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { profile, profilePhoto, notificationPreferences } from "@bbc/db/schema/members";
import type { Executor } from "@bbc/db";

/** Hard-delete the member's profile, photo and prefs. Tombstone runs in a later consumer so siblings still see the
 *  payload. The photo goes first, by name; the FK (ON DELETE CASCADE) would take it with the profile anyway. Delivered
 *  twice, the second run deletes nothing. */
export async function onMemberDeleted(
  deps: {
    tx: Executor;
  },
  raw: unknown,
) {
  const evt = MemberDeletedV1.parse(raw);
  await deps.tx.delete(profilePhoto).where(eq(profilePhoto.memberId, evt.memberId));
  await deps.tx.delete(profile).where(eq(profile.memberId, evt.memberId));
  await deps.tx.delete(notificationPreferences).where(eq(notificationPreferences.memberId, evt.memberId));
}
