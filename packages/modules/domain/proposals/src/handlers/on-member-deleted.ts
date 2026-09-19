import { eq } from "drizzle-orm";
import { offerTargets } from "@bbc/db/schema/proposals";

export async function onMemberDeleted(deps: { tx: any; memberId: string }) {
  await deps.tx.delete(offerTargets).where(eq(offerTargets.memberId, deps.memberId));
}
