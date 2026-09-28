import { eq, sql } from "drizzle-orm";
import { requestEvents, requests } from "@bbc/db/schema/requests";
import type { Executor } from "@bbc/db";

/** Redact contact PII and drop ownership. The row stays for an open CRM lead (CHECK-safe placeholders). */
export async function onMemberDeleted(deps: { tx: Executor; memberId: string }) {
  const selected = await deps.tx.select({ id: requests.id }).from(requests).where(eq(requests.memberId, deps.memberId));
  const rows: { id: string }[] = Array.isArray(selected) ? selected : [];
  await deps.tx
    .update(requests)
    .set({
      memberId: null,
      contactName: "[deleted]",
      contactPhone: "+0000000",
      contactEmail: "deleted@invalid",
      phoneE164: null,
      note: null,
      status: "closed",
      updatedAt: sql`now()`,
    })
    .where(eq(requests.memberId, deps.memberId));
  for (const row of rows) {
    await deps.tx.insert(requestEvents).values({
      requestId: row.id,
      status: "closed",
      note: "account deleted",
      actor: "system",
    });
  }
}
