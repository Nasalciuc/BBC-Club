import { createHmac, timingSafeEqual } from "node:crypto";
import { requestRoute } from "./route";

export type OperatorAction = "quoted" | "booked" | "closed";
const TTL_S = 7 * 24 * 3600;
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** token = base64url(requestId.action.exp).base64url(hmac) — one request, one status, one week. */
export function signAction(secret: string, requestId: string, action: OperatorAction, now = Date.now()): string {
  const body = `${requestId}.${action}.${Math.floor(now / 1000) + TTL_S}`;
  return `${b64u(body)}.${b64u(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyAction(
  secret: string,
  token: string,
  now = Date.now(),
):
  | { ok: true; requestId: string; action: OperatorAction }
  | { ok: false; reason: "malformed" | "signature" | "expired" } {
  const [b, s] = token.split(".");
  if (!b || !s) return { ok: false, reason: "malformed" };
  const body = Buffer.from(b, "base64url").toString("utf8");
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "signature" };
  const [requestId, action, exp] = body.split(".");
  if (!requestId || !exp || (action !== "quoted" && action !== "booked" && action !== "closed")) {
    return { ok: false, reason: "malformed" };
  }
  if (Number(exp) * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, requestId, action };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

/** The operator page's route line — the same route the member sees (ADR-IMPL-042). */
export function routeLabel(legs: unknown, tripType: string | null | undefined): string {
  return requestRoute(legs, tripType);
}

export function actionLabel(action: OperatorAction): string {
  if (action === "quoted") return "quote sent";
  return action;
}
