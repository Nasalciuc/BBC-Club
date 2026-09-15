import { hc } from "hono/client";
import type { Hono } from "hono";
import { authMessage } from "@bbc/shared/auth-messages";
import { PasswordBody } from "@bbc/shared/api/v1/proposals";

import { authHeaders } from "@/features/auth/client";
import { env } from "@/lib/env";

/**
 * Hono RPC client. `AppType` cannot be imported from `@bbc/api` (arch: mobile-no-backend);
 * host public routes + cookie headers are enough for entry. Profile/password use fetch helpers
 * because module `/v1` mounts are wired dynamically in `buildApp`.
 */
type AppType = Hono;

export const api = hc<AppType>(env.EXPO_PUBLIC_API_URL, {
  headers: () => authHeaders(),
});

export type ProfileStatus = "active" | "waitlist" | "deleted" | "pending";

export type Profile = {
  memberId: string;
  status: ProfileStatus;
  displayName?: string | null;
  homeAirport?: string | null;
  timezone?: string;
  phone?: string | null;
  crmLinked?: boolean;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: string; status: number };

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

/** GET /v1/profile — session cookie from SecureStore via authHeaders. */
export async function fetchProfile(): Promise<ApiResult<Profile>> {
  const res = await fetch(`${env.EXPO_PUBLIC_API_URL}/v1/profile`, {
    method: "GET",
    headers: { ...authHeaders(), Accept: "application/json" },
  });
  if (res.status === 401) {
    return { ok: false, message: authMessage("UNKNOWN"), code: "UNAUTHORIZED", status: 401 };
  }
  if (!res.ok) {
    const body = (await parseJson(res)) as { error?: { code?: string; message?: string } } | null;
    return {
      ok: false,
      message: body?.error?.message ?? authMessage(body?.error?.code),
      code: body?.error?.code,
      status: res.status,
    };
  }
  const data = (await parseJson(res)) as Profile;
  return { ok: true, data };
}

/** POST /v1/account/password — first-time password after Path A OTP session. */
export async function postAccountPassword(newPassword: string): Promise<ApiResult<{ ok: true }>> {
  const parsed = PasswordBody.safeParse({ newPassword });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("PASSWORD_TOO_SHORT"),
      code: "VALIDATION",
      status: 400,
    };
  }
  const res = await fetch(`${env.EXPO_PUBLIC_API_URL}/v1/account/password`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    const body = (await parseJson(res)) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code;
    return {
      ok: false,
      message: body?.error?.message ?? authMessage(code === "VALIDATION" ? "PASSWORD_COMPROMISED" : code),
      code,
      status: res.status,
    };
  }
  return { ok: true, data: { ok: true } };
}

/** Test/dev only — Maestro fetches OTP without putting it in logs or route params. */
export async function fetchLastOtpForTest(email: string): Promise<string | null> {
  if (env.EXPO_PUBLIC_APP_ENV === "production") return null;
  const url = `${env.EXPO_PUBLIC_API_URL}/v1/test/last-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await parseJson(res)) as { otp?: string } | null;
  return typeof body?.otp === "string" ? body.otp : null;
}
