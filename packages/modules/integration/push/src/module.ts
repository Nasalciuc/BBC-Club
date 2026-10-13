import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { recordingSender, type PushFacade, type PushResult } from "./api";
import { apnsSender } from "./apns";
import { fcmSender, type FcmServiceAccount } from "./fcm";

/**
 * recording until PUSH_ADAPTER=live. Live: Android through FCM; iPhone through APNs once its keys are in env (N1).
 * Until then an iPhone push is "Fatal": the notification is marked failed, nothing retries, and the device token stays.
 * loadEnv has already refused a live adapter without FCM or with half the APNs keys (packages/shared/src/env.ts).
 */
export const pushModule = (override?: PushFacade): ModuleDescriptor<Record<string, never>, PushFacade> => ({
  name: "push",
  layer: "integration",
  init: ({ env }) => {
    if (override) return { exposes: override };
    if (env.PUSH_ADAPTER !== "live") return { exposes: recordingSender() };
    const fcmJson = env.FCM_SERVICE_ACCOUNT_BASE64;
    if (!fcmJson) throw new Error("PUSH_ADAPTER=live requires FCM_SERVICE_ACCOUNT_BASE64");
    const android = fcmSender(JSON.parse(Buffer.from(fcmJson, "base64").toString("utf8")) as FcmServiceAccount);
    const p8 = env.APNS_P8_BASE64;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    const bundleId = env.APNS_BUNDLE_ID;
    const ios =
      p8 && keyId && teamId && bundleId
        ? apnsSender({
            keyP8: Buffer.from(p8, "base64").toString("utf8"),
            keyId,
            teamId,
            bundleId,
            env: env.APNS_ENVIRONMENT,
          })
        : null;
    return {
      exposes: {
        send: async (input): Promise<PushResult> => {
          if (input.platform !== "ios") return android.send(input);
          return ios ? ios.send(input) : { ok: false, reason: "Fatal" };
        },
      },
    };
  },
});
