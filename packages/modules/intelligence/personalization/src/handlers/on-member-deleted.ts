import type { Executor } from "@bbc/db";
import { MemberDeletedV1 } from "@bbc/shared/events/member";
import { createPersonalizationFacade } from "../application/facade";

export async function onMemberDeleted(
  deps: { tx: Executor; memberId?: string | null; tombstone?: (tx: Executor, memberId: string) => Promise<unknown> },
  raw: unknown,
) {
  const memberId = deps.memberId ?? MemberDeletedV1.safeParse(raw).data?.memberId;
  if (!memberId) return;
  await createPersonalizationFacade(deps.tx).redactMember(deps.tx, memberId);
  if (deps.tombstone) await deps.tombstone(deps.tx, memberId);
}
