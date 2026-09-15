/** Notifications facade contract: inbox scoping, markRead IDOR guard.
 *  Runs against postgres-test. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { notificationsRepo } from "../../src/infrastructure/notifications.repo";
import { devicesRepo } from "../../src/infrastructure/devices.repo";

let db: ReturnType<typeof createDb>;
beforeAll(() => {
  const env = loadEnv(process.env);
  db = createDb(env.DATABASE_URL, { max: 3, applicationName: "bbc-notifications-contract" });
});
afterAll(async () => {
  await db.close();
});

const ACTOR = "notif-actor-" + crypto.randomUUID();
const OTHER = "notif-other-" + crypto.randomUUID();

async function insertNotification(memberId: string): Promise<string> {
  const [{ id }]: any = await db.execute(sql`
    INSERT INTO notifications.notifications (member_id, category, title, status)
    VALUES (${memberId}, 'transactional', 'Test notification', 'sent')
    RETURNING id
  `);
  return id as string;
}

async function cleanup(memberIds: string[]) {
  for (const id of memberIds) {
    await db.execute(sql`DELETE FROM notifications.notifications WHERE member_id = ${id}`);
    await db.execute(sql`DELETE FROM notifications.device_tokens WHERE member_id = ${id}`);
  }
}

describe("@bbc/notifications facade", () => {
  it("markRead on another member's row changes 0 rows (IDOR guard)", async () => {
    const notifId = await insertNotification(OTHER);
    try {
      const changed = await notificationsRepo.markRead(db, ACTOR, notifId);
      expect(changed).toBe(0);
    } finally {
      await cleanup([OTHER]);
    }
  });

  it("markRead on own row marks it as read", async () => {
    const notifId = await insertNotification(ACTOR);
    try {
      const changed = await notificationsRepo.markRead(db, ACTOR, notifId);
      expect(changed).toBe(1);
      // Idempotent: second call returns 0 (already read)
      const changed2 = await notificationsRepo.markRead(db, ACTOR, notifId);
      expect(changed2).toBe(0);
    } finally {
      await cleanup([ACTOR]);
    }
  });

  it("unreadCount is scoped to the actor", async () => {
    await insertNotification(ACTOR);
    await insertNotification(ACTOR);
    await insertNotification(OTHER);
    try {
      const count = await notificationsRepo.unreadCount(db, ACTOR);
      expect(count).toBeGreaterThanOrEqual(2);
      const otherCount = await notificationsRepo.unreadCount(db, OTHER);
      expect(otherCount).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([ACTOR, OTHER]);
    }
  });

  it("inbox returns only the actor's notifications", async () => {
    const myId = await insertNotification(ACTOR);
    await insertNotification(OTHER);
    try {
      const items = (await notificationsRepo.inbox(db, ACTOR, 50)) as any[];
      const ids = items.map((n) => n.id);
      expect(ids).toContain(myId);
      const hasOther = items.some((n) => n.memberId === OTHER);
      expect(hasOther).toBe(false);
    } finally {
      await cleanup([ACTOR, OTHER]);
    }
  });

  it("devicesRepo register is idempotent and deactivate is actor-scoped", async () => {
    const deviceId = "device-" + crypto.randomUUID();
    try {
      await devicesRepo.register(db, ACTOR, { deviceId, platform: "ios", nativeToken: "tok-" + deviceId });
      // Registering again (idempotent)
      await devicesRepo.register(db, ACTOR, { deviceId, platform: "ios", nativeToken: "tok-v2-" + deviceId });

      // Another member cannot deactivate ACTOR's device
      const ok = await devicesRepo.deactivate(db, OTHER, deviceId);
      expect(ok).toBe(false);

      // Owner can deactivate
      const ok2 = await devicesRepo.deactivate(db, ACTOR, deviceId);
      expect(ok2).toBe(true);
    } finally {
      await cleanup([ACTOR, OTHER]);
    }
  });
});
