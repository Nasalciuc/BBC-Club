import type { Executor } from "@bbc/db";
import type { Principal } from "@bbc/platform/authz/principal";
import { actorMemberId } from "@bbc/platform/authz/principal";
import { notificationsRepo } from "../infrastructure/notifications.repo";

export async function markRead(db: Executor, principal: Principal, notificationId: string): Promise<"ok" | "not_found" | "forbidden"> {
  const actor = actorMemberId(principal);
  if (!actor) return "forbidden";
  const changed = await notificationsRepo.markRead(db, actor, notificationId);
  return changed ? "ok" : "not_found";       // someone else's notification or already read → identical answer
}
