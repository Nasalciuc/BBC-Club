import { SignJWT, importPKCS8 } from "jose";
import type { PushFacade, PushResult } from "./api/types";

export type FcmServiceAccount = { project_id: string; client_email: string; private_key: string };
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Called when the provider fails in a way no single notification explains — its credentials, the network — with
 *  where, and an Error or a status line, never a token (the module logs it, at most once a minute). */
export type ProviderError = (where: string, detail: unknown) => void;

export function fcmSender(sa: FcmServiceAccount, fetchImpl: typeof fetch = fetch, onError?: ProviderError): PushFacade {
  let access: { value: string; exp: number } | null = null;
  const accessToken = async () => {
    if (access && Date.now() < access.exp - 5 * 60_000) return access.value;
    const key = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`fcm oauth ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    access = { value: j.access_token, exp: Date.now() + j.expires_in * 1_000 };
    return access.value;
  };

  return {
    async send({ token, title, body, data, collapseId }): Promise<PushResult> {
      let res: Response;
      let auth: string;
      try {
        auth = await accessToken();
      } catch (e) {
        // A revoked or rotated service account: every push fails here, so it is said (audit, 30 Oct 2026).
        onError?.("fcm oauth", e);
        return { ok: false, reason: "Transient" };
      }
      try {
        res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            message: {
              token,
              notification: { title, ...(body ? { body } : {}) },
              data: data ?? {},
              android: {
                priority: "HIGH",
                ...(collapseId ? { collapse_key: collapseId, notification: { tag: collapseId } } : {}),
              },
            },
          }),
        });
      } catch (e) {
        onError?.("fcm send", e);
        return { ok: false, reason: "Transient" };
      }
      if (res.ok) return { ok: true, ticketId: ((await res.json()) as { name?: string }).name };
      const err = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; details?: { errorCode?: string }[] };
      };
      const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? "";
      if (code === "UNREGISTERED" || res.status === 404) return { ok: false, reason: "Unregistered" };
      if (code === "INVALID_ARGUMENT" && /token/i.test(JSON.stringify(err)))
        return { ok: false, reason: "BadDeviceToken" };
      if (res.status === 429 || code === "QUOTA_EXCEEDED") {
        return { ok: false, reason: "RateLimited", retryAfterMs: Number(res.headers.get("retry-after") ?? 60) * 1_000 };
      }
      if (res.status === 401 || res.status === 403) {
        access = null;
        onError?.("fcm refused", `HTTP ${res.status} ${code}`.trim());
        return { ok: false, reason: "Fatal" };
      }
      if (res.status >= 500) return { ok: false, reason: "Transient" };
      return { ok: false, reason: "Fatal" };
    },
  };
}
