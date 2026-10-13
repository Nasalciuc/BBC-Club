import { afterEach, describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type { ServerEnv } from "@bbc/shared/env";
import type { ModuleInitDeps } from "@bbc/shared/module-contract";
import { pushModule } from "../src/module";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function rsaPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

/** loadEnv has already checked the keys; init gets them as the server would. */
async function livePush(env: Partial<ServerEnv>) {
  const deps = { db: {}, platform: {}, env: { PUSH_ADAPTER: "live", ...env }, ports: {} };
  const out = await pushModule().init(deps as unknown as ModuleInitDeps<Record<string, never>>);
  if (!out.exposes) throw new Error("push facade missing");
  return out.exposes;
}

describe("pushModule, live on Android only", () => {
  it("sends Android through FCM and marks an iPhone push failed, without a request, while APNs has no keys", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: "t", expires_in: 3600 });
      return Response.json({ name: "projects/bbc/messages/1" });
    }) as typeof fetch;
    const account = { project_id: "bbc", client_email: "push@bbc.iam.gserviceaccount.com", private_key: rsaPem() };
    const push = await livePush({
      FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(JSON.stringify(account)).toString("base64"),
    });

    expect(await push.send({ platform: "android", token: "a", title: "Quote" })).toEqual({
      ok: true,
      ticketId: "projects/bbc/messages/1",
    });
    const before = urls.length;
    expect(await push.send({ platform: "ios", token: "i", title: "Quote" })).toEqual({ ok: false, reason: "Fatal" });
    expect(urls.length).toBe(before);
  });

  it("still refuses to start live without FCM", async () => {
    await expect(livePush({})).rejects.toThrow(/FCM_SERVICE_ACCOUNT_BASE64/);
  });
});
