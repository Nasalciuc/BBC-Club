import { hc } from "hono/client";
import type { Hono } from "hono";
import { authMessage } from "@bbc/shared/auth-messages";
import {
  DeviceBody,
  FeedVM,
  InboxVM,
  NotificationPreferencesBody,
  PasswordBody,
  ProfilePatchBody,
  ProposalDetailVM,
  type DeviceBody as DeviceBodyType,
  type FeedVM as FeedVMType,
  type InboxVM as InboxVMType,
  type NotificationPreferencesBody as NotificationPreferencesBodyType,
  type ProfilePatchBody as ProfilePatchBodyType,
  type ProposalDetailVM as ProposalDetailVMType,
} from "@bbc/shared/api/v1/proposals";

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
  preferences?: {
    destinations?: string[];
    cabin?: "business" | "first";
    frequency?: "monthly" | "quarterly" | "rarely";
    notes?: string;
  };
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: string; status: number };

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function failFromBody(res: Response, body: { error?: { code?: string; message?: string } } | null): ApiResult<never> {
  return {
    ok: false,
    message: body?.error?.message ?? authMessage(body?.error?.code),
    code: body?.error?.code,
    status: res.status,
  };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** GET /v1/profile — session cookie from SecureStore via authHeaders. */
export async function fetchProfile(): Promise<ApiResult<Profile>> {
  const res = await apiFetch("/v1/profile");
  if (res.status === 401) {
    return { ok: false, message: authMessage("UNKNOWN"), code: "UNAUTHORIZED", status: 401 };
  }
  if (!res.ok) {
    const body = (await parseJson(res)) as { error?: { code?: string; message?: string } } | null;
    return failFromBody(res, body);
  }
  const data = (await parseJson(res)) as Profile;
  return { ok: true, data };
}

/** PATCH /v1/profile */
export async function patchProfile(body: ProfilePatchBodyType): Promise<ApiResult<Profile>> {
  const parsed = ProfilePatchBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("VALIDATION"),
      code: "VALIDATION",
      status: 400,
    };
  }
  const res = await apiFetch("/v1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  return { ok: true, data: (await parseJson(res)) as Profile };
}

/** PUT /v1/profile/preferences — notification opt-outs. */
export async function putNotificationPreferences(
  body: NotificationPreferencesBodyType,
): Promise<ApiResult<{ ok: true }>> {
  const parsed = NotificationPreferencesBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("VALIDATION"),
      code: "VALIDATION",
      status: 400,
    };
  }
  const res = await apiFetch("/v1/profile/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  return { ok: true, data: { ok: true } };
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
  const res = await apiFetch("/v1/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export type FeedResult = { feed: FeedVMType; etag: string | null; notModified: boolean };

/** GET /v1/proposals — supports If-None-Match → 304. */
export async function fetchFeed(etag?: string | null): Promise<ApiResult<FeedResult>> {
  const res = await apiFetch("/v1/proposals", {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (res.status === 304) {
    return {
      ok: true,
      data: { feed: { items: [], summary: { total: 0, personal: 0 } }, etag: etag ?? null, notModified: true },
    };
  }
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  const raw = await parseJson(res);
  const parsed = FeedVM.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
  }
  return { ok: true, data: { feed: parsed.data, etag: res.headers.get("ETag"), notModified: false } };
}

/** GET /v1/proposals/:id — 410 expired, 404 IDOR-safe. */
export async function fetchProposal(id: string): Promise<ApiResult<ProposalDetailVMType>> {
  const res = await apiFetch(`/v1/proposals/${encodeURIComponent(id)}`);
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  const raw = await parseJson(res);
  const parsed = ProposalDetailVM.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
  }
  return { ok: true, data: parsed.data };
}

export type RespondState = "interested" | "dismissed";

/** POST /v1/proposals/:id/respond */
export async function respondToProposal(
  id: string,
  response: RespondState,
): Promise<ApiResult<{ state: RespondState; advisor?: string }>> {
  const res = await apiFetch(`/v1/proposals/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  const data = (await parseJson(res)) as { state: RespondState; advisor?: string };
  return { ok: true, data };
}

/** GET /v1/inbox */
export async function fetchInbox(): Promise<ApiResult<InboxVMType>> {
  const res = await apiFetch("/v1/inbox");
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  const raw = await parseJson(res);
  const parsed = InboxVM.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
  }
  return { ok: true, data: parsed.data };
}

/** POST /v1/inbox/:id/read */
export async function markInboxRead(id: string): Promise<ApiResult<{ ok: true }>> {
  const res = await apiFetch(`/v1/inbox/${encodeURIComponent(id)}/read`, { method: "POST" });
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
  }
  return { ok: true, data: { ok: true } };
}

/** POST /v1/devices */
export async function registerDevice(body: DeviceBodyType): Promise<ApiResult<{ ok: true }>> {
  const parsed = DeviceBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("VALIDATION"),
      code: "VALIDATION",
      status: 400,
    };
  }
  const res = await apiFetch("/v1/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
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
