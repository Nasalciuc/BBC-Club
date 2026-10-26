import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { loadEnv } from "@bbc/shared/env";

const base = {
  APP_ORIGIN: "http://localhost:8000",
  DATABASE_URL: "postgres://bbc:bbc@localhost:55432/bbc_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  INTERNAL_API_SECRET: "internal-secret-internal-secret-0000",
  POSTMARK_SERVER_TOKEN: "postmark-token",
};

const b64 = (text: string) => Buffer.from(text).toString("base64");

function pem(type: "rsa" | "ec"): string {
  const { privateKey } =
    type === "rsa"
      ? generateKeyPairSync("rsa", { modulusLength: 2048 })
      : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

const fcm = b64(
  JSON.stringify({ project_id: "bbc", client_email: "push@bbc.iam.gserviceaccount.com", private_key: pem("rsa") }),
);
const apns = {
  APNS_P8_BASE64: b64(pem("ec")),
  APNS_KEY_ID: "KEY1234567",
  APNS_TEAM_ID: "TEAM123456",
  APNS_BUNDLE_ID: "com.buybusinessclass.club",
};

function refusal(source: Record<string, string>): string {
  try {
    loadEnv(source);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("loadEnv accepted it");
}

describe("PUSH_ADAPTER", () => {
  it("names the missing key when live", () => {
    expect(() => loadEnv({ ...base, PUSH_ADAPTER: "live", APNS_KEY_ID: "K" })).toThrow(/APNS_P8_BASE64/);
  });

  it("stays recording outside production", () => {
    expect(loadEnv(base).PUSH_ADAPTER).toBe("recording");
  });

  it("boots production on the recording default", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production" });
    expect(env.PUSH_ADAPTER).toBe("recording");
  });

  it("goes live on Android alone: FCM, no APNs key, the bundle id the example env fills in", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "production",
      PUSH_ADAPTER: "live",
      FCM_SERVICE_ACCOUNT_BASE64: fcm,
      APNS_BUNDLE_ID: "com.buybusinessclass.club",
    });
    expect(env.PUSH_ADAPTER).toBe("live");
    expect(env.APNS_P8_BASE64).toBeUndefined();
  });

  it("goes live on both with every APNs key", () => {
    expect(loadEnv({ ...base, PUSH_ADAPTER: "live", FCM_SERVICE_ACCOUNT_BASE64: fcm, ...apns }).PUSH_ADAPTER).toBe(
      "live",
    );
  });

  it("refuses live without FCM, even with every APNs key", () => {
    expect(refusal({ ...base, PUSH_ADAPTER: "live", ...apns })).toContain("FCM_SERVICE_ACCOUNT_BASE64 (Android)");
  });

  it("refuses half the APNs keys and names the others", () => {
    const message = refusal({
      ...base,
      PUSH_ADAPTER: "live",
      FCM_SERVICE_ACCOUNT_BASE64: fcm,
      APNS_KEY_ID: "KEY1234567",
      APNS_TEAM_ID: "TEAM123456",
    });
    expect(message).toContain("missing APNS_P8_BASE64, APNS_BUNDLE_ID");
  });

  it("refuses an FCM value that is not a service account, and never repeats it", () => {
    for (const value of [b64("not json 7f3a9c"), b64(JSON.stringify({ project_id: "bbc" })), "# base64 of the JSON"]) {
      const message = refusal({ ...base, PUSH_ADAPTER: "live", FCM_SERVICE_ACCOUNT_BASE64: value });
      expect(message).toContain("not base64 of a Firebase service-account JSON");
      expect(message).not.toContain(value);
    }
  });

  it("refuses an APNs key that is not a .p8, and never repeats it", () => {
    const value = b64("-----BEGIN CERTIFICATE-----");
    const message = refusal({
      ...base,
      PUSH_ADAPTER: "live",
      FCM_SERVICE_ACCOUNT_BASE64: fcm,
      ...apns,
      APNS_P8_BASE64: value,
    });
    expect(message).toContain("APNS_P8_BASE64 is not base64 of the .p8 key");
    expect(message).not.toContain(value);
  });

  it("counts a comment Compose kept after an empty APNs key as a key, and refuses the half set", () => {
    // "APNS_P8_BASE64=     # from Apple" reaches the process as "# from Apple" (infra/env-value.sh).
    const message = refusal({
      ...base,
      PUSH_ADAPTER: "live",
      FCM_SERVICE_ACCOUNT_BASE64: fcm,
      APNS_P8_BASE64: "# from Apple Developer → Keys",
    });
    expect(message).toContain("missing APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID");
  });
});
