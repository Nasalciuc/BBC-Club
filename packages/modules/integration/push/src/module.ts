import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { recordingSender, type PushFacade, type PushResult } from "./api";
import { apnsSender } from "./apns";
import { fcmSender, type FcmServiceAccount, type ProviderError } from "./fcm";

/** Once a minute per kind at most: a dead credential fails every push, and one line a minute says so. */
const ONE_MINUTE = 60_000;

export function providerErrorLog(
  logger: { warn: (o: object, m?: string) => void } | undefined,
  now: () => number = Date.now,
): ProviderError {
  const last = new Map<string, number>();
  return (where, detail) => {
    const at = now();
    if ((last.get(where) ?? -Infinity) > at - ONE_MINUTE) return;
    last.set(where, at);
    const error =
      detail instanceof Error
        ? { name: detail.name, message: detail.message.slice(0, 200) }
        : String(detail).slice(0, 200);
    logger?.warn({ where, error }, "push provider failed: every push it sends fails the same way until this is fixed");
  };
}

/**
 * recording until PUSH_ADAPTER=live. Live: Android through FCM; iPhone through APNs once its keys are in env (N1).
 * Until then an iPhone push is "Fatal": the notification is marked failed, nothing retries, and the device token stays.
 * loadEnv has already refused a live adapter without FCM or with half the APNs keys (packages/shared/src/env.ts).
 */
export const pushModule = (override?: PushFacade): ModuleDescriptor<Record<string, never>, PushFacade> => ({
  name: "push",
  layer: "integration",
  init: ({ env, platform }) => {
    if (override) return { exposes: override };
    if (env.PUSH_ADAPTER !== "live") return { exposes: recordingSender() };
    const fcmJson = env.FCM_SERVICE_ACCOUNT_BASE64;
    if (!fcmJson) throw new Error("PUSH_ADAPTER=live requires FCM_SERVICE_ACCOUNT_BASE64");
    const report = providerErrorLog(platform?.logger);
    const android = fcmSender(
      JSON.parse(Buffer.from(fcmJson, "base64").toString("utf8")) as FcmServiceAccount,
      fetch,
      report,
    );
    const p8 = env.APNS_P8_BASE64;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    const bundleId = env.APNS_BUNDLE_ID;
    const ios =
      p8 && keyId && teamId && bundleId
        ? apnsSender(
            {
              keyP8: Buffer.from(p8, "base64").toString("utf8"),
              keyId,
              teamId,
              bundleId,
              env: env.APNS_ENVIRONMENT,
            },
            undefined,
            report,
          )
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
