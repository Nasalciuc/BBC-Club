import type { Executor } from "@bbc/db";
import type { notificationsTable } from "@bbc/db/schema/notifications";

export type NotificationRow = typeof notificationsTable.$inferSelect;

/** The only import surface of @bbc/notifications. module.ts implements it; consumers import it. */
export type NotificationsFacade = {
  inbox(exec: Executor | undefined, actorMemberId: string, limit?: number): Promise<NotificationRow[]>;
  unreadCount(exec: Executor | undefined, actorMemberId: string): Promise<number>;
  markRead(exec: Executor | undefined, actorMemberId: string, id: string): Promise<number>;
};
