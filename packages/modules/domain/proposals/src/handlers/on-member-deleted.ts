import { eq } from "drizzle-orm";
import { offerTargets } from "@bbc/db/schema/proposals";
import type { Executor } from "@bbc/db";

export async function onMemberDeleted(deps: { tx: Executor; memberId: string }) {
  await deps.tx.delete(offerTargets).where(eq(offerTargets.memberId, deps.memberId));
}
