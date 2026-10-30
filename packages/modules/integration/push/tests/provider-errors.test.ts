import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { apnsSender } from "../src/apns";
import { fcmSender } from "../src/fcm";
import { providerErrorLog } from "../src/module";

// Audit of 30 Oct 2026: a revoked service account or a bad .p8 failed every push as Transient or Fatal and nothing said
// why. The senders now tell the module where they failed; the module logs it, at most once a minute per kind.

const rsa = () =>
  generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ec = () =>
  generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
const msg = { platform: "android" as const, token: "dev", title: "Quote" };

describe("push provider failures are said", () => {
  it("fcm: a refused oauth, a network error and a 401 each report where, never the token", async () => {
    const seen: [string, unknown][] = [];
    let step = 0;
    const fetchImpl: typeof fetch = async (url) => {
      step += 1;
      if (String(url).includes("oauth2")) {
        if (step === 1) return new Response("{}", { status: 400 });
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      if (step === 3) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), { status: 401 });
    };
    const sender = fcmSender(
      { project_id: "p", client_email: "a@p.iam.gserviceaccount.com", private_key: rsa() },
      fetchImpl,
      (where, detail) => seen.push([where, detail]),
    );
    expect(await sender.send(msg)).toEqual({ ok: false, reason: "Transient" });
    expect(await sender.send(msg)).toEqual({ ok: false, reason: "Transient" });
    expect(await sender.send(msg)).toEqual({ ok: false, reason: "Fatal" });
    expect(seen.map(([w]) => w)).toEqual(["fcm oauth", "fcm send", "fcm refused"]);
    expect(seen[2]?.[1]).toBe("HTTP 401 UNAUTHENTICATED");
    expect(JSON.stringify(seen).includes("tok")).toBe(false);
  });

  it("apns: a key that does not sign, a dead stream and a refused provider token each report where", async () => {
    const seen: string[] = [];
    const bad = apnsSender(
      { keyP8: "not a key", keyId: "K", teamId: "T", bundleId: "b", env: "sandbox" },
      async () => ({ status: 200, headers: {}, body: "" }),
      (where) => seen.push(where),
    );
    expect(await bad.send({ ...msg, platform: "ios" })).toEqual({ ok: false, reason: "Transient" });
    let n = 0;
    const sender = apnsSender(
      { keyP8: ec(), keyId: "K", teamId: "T", bundleId: "b", env: "sandbox" },
      async () => {
        n += 1;
        if (n === 1) throw new Error("stream reset");
        return { status: 403, headers: {}, body: JSON.stringify({ reason: "InvalidProviderToken" }) };
      },
      (where) => seen.push(where),
    );
    expect(await sender.send({ ...msg, platform: "ios" })).toEqual({ ok: false, reason: "Transient" });
    expect(await sender.send({ ...msg, platform: "ios" })).toEqual({ ok: false, reason: "Transient" });
    expect(seen).toEqual(["apns key", "apns send", "apns refused"]);
  });

  it("the module's log says each kind at most once a minute, with the error's name and message only", () => {
    const lines: { o: object; m?: string }[] = [];
    let now = 0;
    const report = providerErrorLog({ warn: (o, m) => lines.push({ o, m }) }, () => now);
    report("fcm oauth", new Error("invalid_grant"));
    report("fcm oauth", new Error("invalid_grant"));
    report("apns send", "HTTP 403 InvalidProviderToken");
    now = 60_001;
    report("fcm oauth", new Error("invalid_grant"));
    expect(lines.map((l) => (l.o as { where: string }).where)).toEqual(["fcm oauth", "apns send", "fcm oauth"]);
    expect(lines[0]?.o).toEqual({ where: "fcm oauth", error: { name: "Error", message: "invalid_grant" } });
    expect(lines[0]?.m).toContain("push provider failed");
    expect(() => providerErrorLog(undefined)("x", 1)).not.toThrow();
  });
});
