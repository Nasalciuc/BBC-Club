import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { fcmSender } from "../src/fcm";

function privateKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("fcmSender", () => {
  it("reuses the oauth token, maps errors, and sets the collapse key", async () => {
    const calls: { url: string; body: string; auth: string }[] = [];
    let oauth = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      const href = String(url);
      const headers = new Headers(init?.headers);
      calls.push({ url: href, body: String(init?.body ?? ""), auth: headers.get("authorization") ?? "" });
      if (href.includes("oauth2.googleapis.com")) {
        oauth += 1;
        return Response.json({ access_token: `tok-${oauth}`, expires_in: 3600 });
      }
      const message = JSON.parse(String(init?.body)) as {
        message: { data: Record<string, string>; android: { collapse_key?: string; notification?: { tag?: string } } };
      };
      if (message.message.android.collapse_key === "n-1") {
        return Response.json({ name: "projects/p/messages/1" });
      }
      return new Response(
        JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }),
        {
          status: 404,
          headers: { "content-type": "application/json", "retry-after": "30" },
        },
      );
    };
    const sender = fcmSender(
      { project_id: "bbc", client_email: "push@bbc.iam.gserviceaccount.com", private_key: privateKey() },
      fetchImpl,
    );
    const ok = await sender.send({
      platform: "android",
      token: "dev",
      title: "Quote",
      data: { notificationId: "n-1" },
      collapseId: "n-1",
    });
    expect(ok).toEqual({ ok: true, ticketId: "projects/p/messages/1" });
    const again = await sender.send({ platform: "android", token: "dev", title: "Quote" });
    expect(again).toEqual({ ok: false, reason: "Unregistered" });
    expect(oauth).toBe(1);
    const sent = calls.find((c) => c.url.includes("messages:send"));
    expect(sent?.body).toContain('"collapse_key":"n-1"');
    expect(sent?.body).toContain('"tag":"n-1"');
    expect(sent?.body).toContain('"notificationId":"n-1"');

    const limited = fcmSender(
      { project_id: "bbc", client_email: "push@bbc.iam.gserviceaccount.com", private_key: privateKey() },
      async (url) => {
        if (String(url).includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
        return new Response("{}", { status: 429, headers: { "retry-after": "30" } });
      },
    );
    expect(await limited.send({ platform: "android", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "RateLimited",
      retryAfterMs: 30_000,
    });
  });

  it("a fetch that aborts is Transient, and both calls carry a timeout signal", async () => {
    const signals: AbortSignal[] = [];
    const hanging: typeof fetch = async (_url, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("missing signal");
      signals.push(signal);
      throw new DOMException("The operation was aborted", "AbortError");
    };
    const sender = fcmSender(
      { project_id: "bbc", client_email: "push@bbc.iam.gserviceaccount.com", private_key: privateKey() },
      hanging,
    );
    expect(await sender.send({ platform: "android", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "Transient",
    });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]?.aborted).toBe(false);
  });
});
