/** POST /v1/devices + DELETE /v1/devices/:deviceId: register and deactivate device tokens. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
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

describe("one phone, a second member", () => {
  type T = Awaited<ReturnType<typeof testApp>>;
  const register = (t: T, cookie: string, deviceId: string, nativeToken: string) =>
    t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, platform: "ios", nativeToken }),
    });
  /** A request of the member's, marked quoted, and dispatch run: the pushes that went out for it. */
  async function quoteFor(t: T, m: { id: string; cookie: string }) {
    const created = await t.submitRequestAs(m, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    const r = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ status: "quoted" }),
    });
    expect(r.status).toBe(200);
    await t.drainAll();
    const before = t.push.sent.length;
    const job = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(job.status).toBe(200);
    return (t.push.sent.slice(before) as { token: string; data?: Record<string, string> }[]).filter((p) =>
      JSON.stringify(p).includes(id),
    );
  }

  it("the same member under a new deviceId with the phone's token (a reinstall): 201, one row for the token", async () => {
    const t = await testApp({ suite: "devices-reinstall" });
    const token = `apns-${crypto.randomUUID()}`;
    expect((await register(t, t.memberA.cookie, `install-1-${token}`, token)).status).toBe(201);
    expect((await register(t, t.memberA.cookie, `install-2-${token}`, token)).status).toBe(201);
    const rows = (await t.db.execute(
      sql`SELECT device_id FROM notifications.device_tokens WHERE native_token = ${token}`,
    )) as { device_id: string }[];
    expect(rows).toEqual([{ device_id: `install-2-${token}` }]);
    await t.close();
  });

  for (const how of ["signed out", "lapsed"] as const) {
    it(`B registers the phone after A ${how}: 201, and the phone gets B's pushes, never A's`, async () => {
      const t = await testApp({ suite: `devices-reassign-${how === "lapsed" ? "lapsed" : "out"}` });
      await t.db.execute(
        sql`UPDATE members.profile SET status = 'active' WHERE member_id IN (${t.memberA.id}, ${t.memberB.id})`,
      );
      const deviceId = `phone-${crypto.randomUUID()}`;
      const token = `apns-${crypto.randomUUID()}`;
      expect((await register(t, t.memberA.cookie, deviceId, token)).status).toBe(201);
      if (how === "signed out") {
        const out = await t.app.request(`/v1/devices/${deviceId}`, {
          method: "DELETE",
          headers: { Cookie: t.memberA.cookie },
        });
        expect(out.status).toBe(200);
      }
      // (lapsed: A's session ended without the DELETE reaching us — A's row is still active.)
      const b = await register(t, t.memberB.cookie, deviceId, token);
      expect(b.status).toBe(201);
      const rows = (await t.db.execute(
        sql`SELECT member_id, active FROM notifications.device_tokens WHERE native_token = ${token}`,
      )) as { member_id: string; active: boolean }[];
      expect(rows).toEqual([{ member_id: t.memberB.id, active: true }]);

      expect(await quoteFor(t, t.memberA)).toEqual([]);
      const forB = await quoteFor(t, t.memberB);
      expect(forB.map((p) => p.token)).toEqual([token]);
      await t.close();
    });
  }
});
