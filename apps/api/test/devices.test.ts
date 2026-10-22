/** POST /v1/devices + DELETE /v1/devices/:deviceId: register and deactivate device tokens. */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("POST /v1/devices", () => {
  it("registers a device token for the caller", async () => {
    const t = await testApp({ suite: "devices-reg" });
    const r = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "dev-abc-" + crypto.randomUUID(),
        platform: "ios",
        nativeToken: "tok-" + crypto.randomUUID(),
      }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    await t.close();
  });

  it("idempotent: registering the same deviceId twice does not fail", async () => {
    const t = await testApp({ suite: "devices-idem" });
    const payload = {
      deviceId: "dev-dup-" + crypto.randomUUID(),
      platform: "android",
      nativeToken: "tok-dup-" + crypto.randomUUID(),
    };
    await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const r2 = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, nativeToken: "tok-v2-" + crypto.randomUUID() }),
    });
    expect(r2.status).toBe(201);
    await t.close();
  });

  it("400 for missing fields", async () => {
    const t = await testApp({ suite: "devices-bad" });
    const r = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "x" }), // missing platform + nativeToken
    });
    expect(r.status).toBe(400);
    await t.close();
  });

  it("a token Postgres cannot index or hold is 400, never 500; a real one still registers", async () => {
    const t = await testApp({ suite: "devices-limits" });
    // devices.register allows a burst of 5 per member: the cases are shared between A and B.
    const post = (cookie: string, over: Record<string, unknown>) =>
      t.app.request("/v1/devices", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: "dev-lim-" + crypto.randomUUID(),
          platform: "ios",
          nativeToken: "tok-" + crypto.randomUUID(),
          ...over,
        }),
      });
    // 10 000 random characters do not compress under the btree row limit of UNIQUE device_native_token (2 704 bytes).
    const longToken = Buffer.from(crypto.getRandomValues(new Uint8Array(7_500))).toString("base64");
    expect(longToken.length).toBe(10_000);
    const refused: [string, Record<string, unknown>][] = [
      [t.memberA.cookie, { nativeToken: longToken }],
      [t.memberA.cookie, { nativeToken: "tok\u0000" + crypto.randomUUID() }],
      [t.memberA.cookie, { deviceId: "dev\u0000" + crypto.randomUUID() }],
      [t.memberA.cookie, { expoToken: "ExponentPushToken[\u0000]" }],
      [t.memberA.cookie, { expoToken: "x".repeat(1025) }],
      [t.memberB.cookie, { appVersion: "1.0.0\u0000" }],
      [t.memberB.cookie, { appVersion: "1".repeat(33) }],
      [t.memberB.cookie, { deviceId: "dev\ud800" + crypto.randomUUID() }],
    ];
    for (const [cookie, over] of refused) {
      const r = await post(cookie, over);
      expect([Object.keys(over)[0], r.status]).toEqual([Object.keys(over)[0], 400]);
    }
    // APNs (64 hex) and FCM (~160) tokens are far inside the limit.
    expect(
      (await post(t.memberB.cookie, { nativeToken: "a".repeat(64) + crypto.randomUUID(), appVersion: "3.0.0" })).status,
    ).toBe(201);
    expect(
      (
        await post(t.memberB.cookie, {
          platform: "android",
          nativeToken: "f".repeat(163) + crypto.randomUUID(),
          expoToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
        })
      ).status,
    ).toBe(201);
    await t.close();
  });

  it("a push token is printable ASCII: 1 024 characters outside it overflow the index row (a 500)", async () => {
    const t = await testApp({ suite: "devices-ascii" });
    const post = (nativeToken: string) =>
      t.app.request("/v1/devices", {
        method: "POST",
        headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "dev-ascii-" + crypto.randomUUID(), platform: "android", nativeToken }),
      });
    // 1 024 random CJK characters: inside max(1024), 3 072 bytes in UTF-8 — over UNIQUE device_native_token's 2 704.
    const cjk = Array.from({ length: 1024 }, () =>
      String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20_000)),
    ).join("");
    for (const token of [cjk, "tok en", "tok\u00e9"]) {
      expect([token.slice(0, 8), (await post(token)).status]).toEqual([token.slice(0, 8), 400]);
    }
    // FCM's alphabet (letters, digits, `_:-`) still registers.
    expect((await post("cK3x_9:APA91b-" + "Q".repeat(140) + crypto.randomUUID())).status).toBe(201);
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "devices-unauth" });
    const r = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "x", platform: "ios", nativeToken: "y" }),
    });
    expect(r.status).toBe(401);
    await t.close();
  });
});

describe("DELETE /v1/devices/:deviceId", () => {
  it("deactivates own device (IDOR guard: 404 for another member's device)", async () => {
    const t = await testApp({ suite: "devices-del" });
    const deviceId = "dev-del-" + crypto.randomUUID();
    // Register for member A
    await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, platform: "ios", nativeToken: "tok-del-" + deviceId }),
    });

    // Member B cannot delete member A's device
    const rB = await t.app.request(`/v1/devices/${deviceId}`, {
      method: "DELETE",
      headers: { Cookie: t.memberB.cookie },
    });
    expect(rB.status).toBe(404);

    // Member A can delete their own device
    const rA = await t.app.request(`/v1/devices/${deviceId}`, {
      method: "DELETE",
      headers: { Cookie: t.memberA.cookie },
    });
    expect(rA.status).toBe(200);
    await t.close();
  });

  it("an id POST refuses (U+0000 as %00 in the path) is 404, never 500", async () => {
    const t = await testApp({ suite: "devices-del-nul" });
    const r = await t.app.request("/v1/devices/dev%00x", { method: "DELETE", headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    await t.close();
  });

  it("401 without session", async () => {
    const t = await testApp({ suite: "devices-del-unauth" });
    const r = await t.app.request("/v1/devices/some-device", { method: "DELETE" });
    expect(r.status).toBe(401);
    await t.close();
  });
});
