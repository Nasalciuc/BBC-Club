import { and, eq, ne, or, sql } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import { deviceTokens } from "@bbc/db/schema/notifications";

type Registration = {
  deviceId: string;
  platform: "ios" | "android";
  nativeToken: string;
  expoToken?: string;
  appVersion?: string;
};

/** A unique violation: another registration of the same token committed between our delete and our insert. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export const devicesRepo = {
  /** Upsert by (memberId, deviceId) — idempotent registration. A native token belongs to the phone's current member
   *  (UNIQUE native_token): the row another member — or this member's earlier install — holds for it is removed in the
   *  same transaction, so a second member signing in on a phone registers it (never a 500), and the previous member's
   *  pushes stop landing there, whether they signed out (row kept inactive) or their session lapsed (row still active).
   *  A registration racing ours for the same token is retried once. */
  async register(exec: Executor, actorMemberId: string, data: Registration): Promise<void> {
    const once = () =>
      withTx(exec, async (tx) => {
        await tx
          .delete(deviceTokens)
          .where(
            and(
              eq(deviceTokens.nativeToken, data.nativeToken),
              or(ne(deviceTokens.memberId, actorMemberId), ne(deviceTokens.deviceId, data.deviceId)),
            ),
          );
        await tx
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
      });
    try {
      await once();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await once();
    }
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
