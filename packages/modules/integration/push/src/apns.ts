import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import type { PushFacade, PushResult } from "./api/types";

export type ApnsConfig = {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  env: "sandbox" | "production";
};
/** Injected in tests; production uses one long-lived HTTP/2 session per host. */
export type ApnsTransport = (req: {
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

const HOST = { sandbox: "https://api.sandbox.push.apple.com", production: "https://api.push.apple.com" } as const;
const TOKEN_TTL_MS = 45 * 60_000;

export function http2Transport(authority: string, timeoutMs = 10_000): ApnsTransport {
  let session: http2.ClientHttp2Session | null = null;
  const get = () => {
    if (session && !session.closed && !session.destroyed) return session;
    session = http2.connect(authority);
    session.on("goaway", () => session?.close());
    session.on("error", () => {
      session?.destroy();
      session = null;
    });
    return session;
  };
  return ({ path, headers, body }) =>
    new Promise((resolve, reject) => {
      let settled = false;
      let finished = false;
      let gotResponse = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const req = get().request({ ":method": "POST", ":path": path, ...headers });
      let status = 0;
      let resHeaders: Record<string, string> = {};
      let data = "";
      req.setEncoding("utf8");
      req.on("response", (h) => {
        gotResponse = true;
        status = Number(h[":status"]);
        resHeaders = h as Record<string, string>;
      });
      req.on("data", (c) => {
        data += c;
      });
      req.on("end", () => {
        if (!gotResponse) return;
        finished = true;
        finish(() => resolve({ status, headers: resHeaders, body: data }));
      });
      req.on("error", (err) => finish(() => reject(err)));
      req.on("close", () => {
        if (!finished) finish(() => reject(new Error("apns stream closed")));
      });
      req.setTimeout(timeoutMs, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.end(body);
    });
}

export function apnsSender(cfg: ApnsConfig, transport: ApnsTransport = http2Transport(HOST[cfg.env])): PushFacade {
  let token: { value: string; at: number } | null = null;
  const bearer = async () => {
    if (token && Date.now() - token.at < TOKEN_TTL_MS) return token.value;
    const key = await importPKCS8(cfg.keyP8, "ES256");
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
      .setIssuer(cfg.teamId)
      .setIssuedAt()
      .sign(key);
    token = { value, at: Date.now() };
    return value;
  };

  return {
    async send({ token: deviceToken, title, body, data, collapseId }): Promise<PushResult> {
      const headers: Record<string, string> = {
        authorization: `bearer ${await bearer()}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
      };
      const payload = JSON.stringify({
        aps: { alert: { title, ...(body ? { body } : {}) }, sound: "default" },
        ...data,
      });
      let res;
      try {
        res = await transport({ path: `/3/device/${deviceToken}`, headers, body: payload });
      } catch {
        return { ok: false, reason: "Transient" };
      }
      if (res.status === 200) return { ok: true, ticketId: res.headers["apns-id"] };
      const reason = (() => {
        try {
          return JSON.parse(res.body).reason as string;
        } catch {
          return "";
        }
      })();
      if (res.status === 410 || reason === "Unregistered") return { ok: false, reason: "Unregistered" };
      if (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic")
        return { ok: false, reason: "BadDeviceToken" };
      if (res.status === 429) return { ok: false, reason: "RateLimited", retryAfterMs: 60_000 };
      if (res.status === 403 && /ProviderToken/.test(reason)) {
        token = null;
        return { ok: false, reason: "Transient" };
      }
      if (res.status >= 500) return { ok: false, reason: "Transient" };
      return { ok: false, reason: "Fatal" };
    },
  };
}
