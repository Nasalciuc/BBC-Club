import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { recordingSender, type PushFacade } from "./api";
import { apnsSender } from "./apns";
import { fcmSender, type FcmServiceAccount } from "./fcm";

/** recording until PUSH_ADAPTER=live and the provider keys are in env. */
export const pushModule = (override?: PushFacade): ModuleDescriptor<Record<string, never>, PushFacade> => ({
  name: "push",
  layer: "integration",
  init: ({ env }) => {
    if (override) return { exposes: override };
    if (env.PUSH_ADAPTER !== "live") return { exposes: recordingSender() };
    const p8 = env.APNS_P8_BASE64;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    const bundleId = env.APNS_BUNDLE_ID;
    const fcmJson = env.FCM_SERVICE_ACCOUNT_BASE64;
    if (!p8 || !keyId || !teamId || !bundleId || !fcmJson) {
      throw new Error(
        "PUSH_ADAPTER=live requires APNS_P8_BASE64, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, FCM_SERVICE_ACCOUNT_BASE64",
      );
    }
    const ios = apnsSender({
      keyP8: Buffer.from(p8, "base64").toString("utf8"),
      keyId,
      teamId,
      bundleId,
      env: env.APNS_ENVIRONMENT,
    });
    const android = fcmSender(JSON.parse(Buffer.from(fcmJson, "base64").toString("utf8")) as FcmServiceAccount);
    return { exposes: { send: (input) => (input.platform === "ios" ? ios : android).send(input) } };
  },
});
