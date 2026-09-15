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

  it("401 without session", async () => {
    const t = await testApp({ suite: "devices-del-unauth" });
    const r = await t.app.request("/v1/devices/some-device", { method: "DELETE" });
    expect(r.status).toBe(401);
    await t.close();
  });
});
