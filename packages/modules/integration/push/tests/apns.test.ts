import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import http2 from "node:http2";
import { apnsSender, http2Transport, type ApnsTransport } from "../src/apns";

function p8(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function scripted(responses: { status: number; headers?: Record<string, string>; body?: string }[]) {
  const calls: { headers: Record<string, string>; body: string; path: string }[] = [];
  const transport: ApnsTransport = async (req) => {
    calls.push({ headers: req.headers, body: req.body, path: req.path });
    const next = responses[calls.length - 1] ?? { status: 500 };
    return { status: next.status, headers: next.headers ?? {}, body: next.body ?? "" };
  };
  return { transport, calls };
}

describe("apnsSender", () => {
  it("maps statuses, refreshes a rejected provider token, and never sends the key", async () => {
    const key = p8();
    const { transport, calls } = scripted([
      { status: 200, headers: { "apns-id": "apple-1" } },
      { status: 410, body: JSON.stringify({ reason: "Unregistered" }) },
      { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) },
      { status: 429, body: "{}" },
      { status: 403, body: JSON.stringify({ reason: "ExpiredProviderToken" }) },
      { status: 200, headers: { "apns-id": "apple-2" } },
      { status: 503, body: "" },
    ]);
    const sender = apnsSender(
      { keyP8: key, keyId: "KEYID", teamId: "TEAM", bundleId: "com.buybusinessclass.club", env: "sandbox" },
      transport,
    );
    const ok = await sender.send({ platform: "ios", token: "dev", title: "Quote", collapseId: "n-1" });
    expect(ok).toEqual({ ok: true, ticketId: "apple-1" });
    expect(calls[0]?.headers["apns-collapse-id"]).toBe("n-1");
    expect(calls[0]?.body.includes("PRIVATE")).toBe(false);

    expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "Unregistered",
    });
    expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "BadDeviceToken",
    });
    expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "RateLimited",
      retryAfterMs: 60_000,
    });

    expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "Transient",
    });
    const again = await sender.send({ platform: "ios", token: "dev", title: "Quote" });
    expect(again).toEqual({ ok: true, ticketId: "apple-2" });
    expect(calls[5]?.headers.authorization).not.toBe(calls[4]?.headers.authorization);
    expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
      ok: false,
      reason: "Transient",
    });
  });

  it("a timed-out stream rejects instead of hanging, and the sender maps that to Transient", async () => {
    const server = http2.createServer();
    server.on("stream", () => {
      // Never respond. The client timeout must settle the promise.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const transport = http2Transport(`http://127.0.0.1:${port}`, 50);
      await expect(transport({ path: "/3/device/tok", headers: {}, body: "{}" })).rejects.toThrow(/closed/);
      const sender = apnsSender(
        { keyP8: p8(), keyId: "KEYID", teamId: "TEAM", bundleId: "com.buybusinessclass.club", env: "sandbox" },
        async () => {
          throw new Error("apns stream closed");
        },
      );
      expect(await sender.send({ platform: "ios", token: "dev", title: "Quote" })).toEqual({
        ok: false,
        reason: "Transient",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
