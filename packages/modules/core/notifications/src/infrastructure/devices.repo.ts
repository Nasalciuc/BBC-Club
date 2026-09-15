import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { deviceTokens } from "@bbc/db/schema/notifications";

export const devicesRepo = {
  /** Upsert by (memberId, deviceId) -- idempotent registration. */
  async register(
    exec: Executor,
    actorMemberId: string,
    data: {
      deviceId: string;
      platform: "ios" | "android";
      nativeToken: string;
      expoToken?: string;
      appVersion?: string;
    },
  ): Promise<void> {
    await exec
      .insert(deviceTokens)
      .values({
        memberId: actorMemberId,
        deviceId: data.deviceId,
        platform: data.platform,
        nativeToken: data.nativeToken,
        expoToken: data.expoToken ?? null,
        appVersion: data.appVersion ?? null,
        active: true,
        lastSeenAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [deviceTokens.memberId, deviceTokens.deviceId],
        set: {
          nativeToken: data.nativeToken,
          expoToken: data.expoToken ?? null,
          appVersion: data.appVersion ?? null,
          active: true,
          deactivatedReason: null,
          lastSeenAt: sql`now()`,
        },
      });
  },

  /** Deactivate a device. Returns false if the device does not belong to this member. */
  async deactivate(exec: Executor, actorMemberId: string, deviceId: string): Promise<boolean> {
    const rows = await exec
      .update(deviceTokens)
      .set({ active: false, deactivatedReason: "logout" })
      .where(and(eq(deviceTokens.memberId, actorMemberId), eq(deviceTokens.deviceId, deviceId)))
      .returning({ id: deviceTokens.id });
    return rows.length > 0;
  },
};
