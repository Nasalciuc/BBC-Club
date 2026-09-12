import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import type { PushSender } from "@bbc/push";
import { notificationsRepo } from "./infrastructure/notifications.repo";

type Exposes = {
  inbox(exec: unknown, actorMemberId: string, limit?: number): Promise<unknown[]>;
  unreadCount(exec: unknown, actorMemberId: string): Promise<number>;
  markRead(exec: unknown, actorMemberId: string, id: string): Promise<number>;
};

/** needs: [] for now — stage 3 adds needs: ["members"] for timezone and consent at dispatch time. */
export const notificationsModule = (push?: PushSender): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "notifications",
  layer: "core",
  init: ({ db }) => ({
    exposes: {
      inbox: (exec, actor, limit) => notificationsRepo.inbox((exec ?? db) as any, actor, limit),
      unreadCount: (exec, actor) => notificationsRepo.unreadCount((exec ?? db) as any, actor),
      markRead: (exec, actor, id) => notificationsRepo.markRead((exec ?? db) as any, actor, id),
    },
    routes: [],      // stage 3: /v1/inbox, /v1/devices, preferences
    consumers: [],   // stage 3: offer.published, offer.responded, member.registered, member.deleted
    jobs: [],        // stage 3: dispatch (uses `push`), receipts, cleanup-devices
  }),
});
