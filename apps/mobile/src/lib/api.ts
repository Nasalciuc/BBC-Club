import { hc } from "hono/client";
import type { Hono } from "hono";
import { authMessage } from "@bbc/shared/auth-messages";
import {
  DeviceBody,
  NotificationPreferencesBody,
  PasswordBody,
  ProfilePatchBody,
  ProposalDetailVM,
  TravelPreferencesBody,
  type DeviceBody as DeviceBodyType,
  type NotificationPreferencesBody as NotificationPreferencesBodyType,
  type ProfilePatchBody as ProfilePatchBodyType,
  type ProposalDetailVM as ProposalDetailVMType,
  type TravelPreferencesBody as TravelPreferencesBodyType,
} from "@bbc/shared/api/v1/proposals";
import {
  AirportVM,
  FareVM,
  HomeVM,
  SearchResultVM,
  type AirportVM as AirportVMType,
  type FareVM as FareVMType,
  type HomeVM as HomeVMType,
  type SearchResultVM as SearchResultVMType,
} from "@bbc/shared/api/v1/fares";
import {
  HomeSuggestionVM,
  PopularVM,
  type HomeSuggestionVM as HomeSuggestionVMType,
  type PopularVM as PopularVMType,
} from "@bbc/shared/api/v1/discovery";
import type { ProfileVM as Profile } from "@bbc/shared/api/v1/profile";
import {
  RequestBody,
  RequestList,
  RequestVM,
  type RequestBody as RequestBodyType,
  type RequestVM as RequestVMType,
} from "@bbc/shared/api/v1/requests";

import { authHeaders } from "@/features/auth/client";
import { env } from "@/lib/env";
import { appPlatform, appVersion } from "@/lib/app-meta";
import { emitSessionRevoked } from "@/lib/session-events";
import { API_TIMEOUT_MS, NetworkError, networkFail, timeoutSignal } from "@/lib/timeout";

/** Better Auth routes — wrong password/OTP must not trigger global sign-out bounce. */
function isAuthApiPath(path: string): boolean {
  return path === "/api/auth" || path.startsWith("/api/auth/");
}

/**
 * Hono RPC client. `AppType` cannot be imported from `@bbc/api` (arch: mobile-no-backend);
 * host public routes + cookie headers are enough for entry. Profile/password use fetch helpers
 * because module `/v1` mounts are wired dynamically in `buildApp`.
 */
type AppType = Hono;

export const api = hc<AppType>(env.EXPO_PUBLIC_API_URL, {
  headers: () => authHeaders(),
});

export type { Profile };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string; status: number; gone?: FareGoneContext; retryAfterS?: number };

/** Closed-fare facts from a 410 body — only when the server sent `error.context`. */
export type FareGoneContext = {
  price: number;
  currency: string;
  validUntil: string;
  from: string;
  to: string;
};

function parseFareGoneContext(raw: unknown): FareGoneContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.price !== "number" ||
    typeof o.currency !== "string" ||
    typeof o.validUntil !== "string" ||
    typeof o.from !== "string" ||
    typeof o.to !== "string"
  ) {
    return undefined;
  }
  return {
    price: o.price,
    currency: o.currency,
    validUntil: o.validUntil,
    from: o.from,
    to: o.to,
  };
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function failFromBody(res: Response, body: { error?: { code?: string; message?: string } } | null): ApiResult<never> {
  if (res.status === 429) {
    const header = Number(res.headers.get("Retry-After"));
    const retryAfterS = Number.isFinite(header) && header >= 0 ? Math.ceil(header) : undefined;
    return {
      ok: false,
      message: authMessage("TOO_MANY_ATTEMPTS"),
      code: "RATE_LIMITED",
      status: 429,
      ...(retryAfterS !== undefined ? { retryAfterS } : {}),
    };
  }
  return {
    ok: false,
    message: body?.error?.message ?? authMessage(body?.error?.code),
    code: body?.error?.code,
    status: res.status,
  };
}

async function asResult<T>(run: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof NetworkError) return networkFail(e);
    throw e;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let cancel = () => {};
  let signal = init?.signal;
  if (!signal) {
    const own = timeoutSignal(API_TIMEOUT_MS);
    signal = own.signal;
    cancel = own.cancel;
  }
  try {
    const headers: Record<string, string> = {
      ...authHeaders(),
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    const sentCookie = typeof headers.Cookie === "string" && headers.Cookie.length > 0;
    const res = await fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
      ...init,
      signal: signal,
      headers,
    });
    // 401 without a Cookie is a race (SecureStore not ready), not a revoked session.
    if (res.status === 401 && !isAuthApiPath(path) && sentCookie) {
      emitSessionRevoked();
    }
    return res;
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    throw new NetworkError(timeout ? "TIMEOUT" : "OFFLINE");
  } finally {
    cancel();
  }
}

/** GET /v1/profile — session cookie from SecureStore via authHeaders. */
export async function fetchProfile(): Promise<ApiResult<Profile>> {
  return asResult(async () => {
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
  });
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
  return asResult(async () => {
    const res = await apiFetch("/v1/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    return { ok: true, data: (await parseJson(res)) as Profile };
  });
}

/** PUT /v1/profile/travel — cabin, passengers, destinations (merged, never replaced). */
export async function putTravelPreferences(body: TravelPreferencesBodyType): Promise<ApiResult<Profile>> {
  const parsed = TravelPreferencesBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("VALIDATION"),
      code: "VALIDATION",
      status: 400,
    };
  }
  return asResult(async () => {
    const res = await apiFetch("/v1/profile/travel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    return { ok: true, data: (await parseJson(res)) as Profile };
  });
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
  return asResult(async () => {
    const res = await apiFetch("/v1/profile/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    return { ok: true, data: { ok: true } };
  });
}

/** GET /v1/account/password — whether a password is stored. The server decides, by better-auth's own rule. */
export async function fetchPasswordStatus(): Promise<ApiResult<{ hasPassword: boolean }>> {
  return asResult(async () => {
    const res = await apiFetch("/v1/account/password");
    if (!res.ok) {
      const body = (await parseJson(res)) as { error?: { code?: string; message?: string } } | null;
      return failFromBody(res, body);
    }
    const body = (await parseJson(res)) as { hasPassword?: unknown } | null;
    return { ok: true, data: { hasPassword: body?.hasPassword === true } };
  });
}

/** POST /v1/account/password — Path A set, or change when currentPassword is sent. */
export async function postAccountPassword(
  newPassword: string,
  currentPassword?: string,
): Promise<ApiResult<{ ok: true }>> {
  const parsed = PasswordBody.safeParse({
    newPassword,
    ...(currentPassword ? { currentPassword } : {}),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("PASSWORD_TOO_SHORT"),
      code: "VALIDATION",
      status: 400,
    };
  }
  return asResult(async () => {
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
  });
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
  return asResult(async () => {
    const res = await apiFetch("/v1/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    return { ok: true, data: { ok: true } };
  });
}

/** DELETE /v1/devices/:deviceId — deactivate this device's push token. */
export async function unregisterDevice(deviceId: string): Promise<ApiResult<{ ok: true }>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    return { ok: true, data: { ok: true } };
  });
}

/** Test/dev only — Maestro fetches OTP without putting it in logs or route params. */
export async function fetchLastOtpForTest(email: string): Promise<string | null> {
  if (env.EXPO_PUBLIC_APP_ENV === "production") return null;
  const own = timeoutSignal(API_TIMEOUT_MS);
  try {
    const url = `${env.EXPO_PUBLIC_API_URL}/v1/test/last-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: own.signal });
    if (!res.ok) return null;
    const body = (await parseJson(res)) as { otp?: string } | null;
    return typeof body?.otp === "string" ? body.otp : null;
  } catch {
    return null;
  } finally {
    own.cancel();
  }
}

export type HomeResult = { home: HomeVMType; etag: string | null; notModified: boolean };

/** GET /v1/home — ETag, 5-minute private cache. */
export async function fetchHome(etag?: string | null): Promise<ApiResult<HomeResult>> {
  return asResult<HomeResult>(async () => {
    const res = await apiFetch("/v1/home", {
      headers: etag ? { "If-None-Match": etag } : {},
    });
    if (res.status === 304) {
      return {
        ok: true,
        data: {
          home: { home: null, destinations: [], sections: [] },
          etag: etag ?? null,
          notModified: true,
        },
      };
    }
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    const parsed = HomeVM.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: { home: parsed.data, etag: res.headers.get("ETag"), notModified: false } };
  });
}

/** GET /v1/search?from&to&cabin */
export async function searchFares(q: {
  from: string;
  to: string;
  cabin: "business" | "first";
  /** ISO datetime: only fares valid at that instant. Omitted for flexible dates (the search that can estimate). */
  when?: string;
}): Promise<ApiResult<SearchResultVMType>> {
  return asResult(async () => {
    const params = new URLSearchParams({ from: q.from, to: q.to, cabin: q.cabin });
    if (q.when) params.set("when", q.when);
    const res = await apiFetch(`/v1/search?${params}`);
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    const parsed = SearchResultVM.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: parsed.data };
  });
}

/** GET /v1/airports?q= — max 8. */
export async function fetchAirports(query: string): Promise<ApiResult<AirportVMType[]>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/airports?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    if (!Array.isArray(raw)) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    const items: AirportVMType[] = [];
    for (const row of raw) {
      const parsed = AirportVM.safeParse(row);
      if (parsed.success) items.push(parsed.data);
    }
    return { ok: true, data: items };
  });
}

/** GET /v1/airports/popular?from= — "Popular from <city>" (ADR-IMPL-039): at most four destinations, names only. */
export async function fetchPopular(from: string): Promise<ApiResult<PopularVMType>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/airports/popular?from=${encodeURIComponent(from)}`);
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const parsed = PopularVM.safeParse(await parseJson(res));
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: parsed.data };
  });
}

/** GET /v1/airports/home-suggestion?tz= — the busiest airport in the phone's time zone, or null (ADR-IMPL-039). */
export async function fetchHomeSuggestion(tz: string): Promise<ApiResult<HomeSuggestionVMType>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/airports/home-suggestion?tz=${encodeURIComponent(tz)}`);
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const parsed = HomeSuggestionVM.safeParse(await parseJson(res));
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: parsed.data };
  });
}

/** GET /v1/fares/:id — 410 when expired; may include optional `error.context` closed-fare facts. */
export async function fetchFare(id: string): Promise<ApiResult<FareVMType>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/fares/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = (await parseJson(res)) as {
        error?: { code?: string; message?: string; context?: Record<string, unknown> };
      } | null;
      if (res.status === 410) {
        const gone = parseFareGoneContext(body?.error?.context);
        return {
          ok: false,
          message: body?.error?.message ?? "This fare has closed.",
          code: body?.error?.code ?? "GONE",
          status: 410,
          ...(gone ? { gone } : {}),
        };
      }
      return failFromBody(res, body);
    }
    const raw = await parseJson(res);
    const parsed = FareVM.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: parsed.data };
  });
}

/** GET /v1/proposals/:id — offer media / flight facts for fare detail. */
export async function fetchProposal(id: string): Promise<ApiResult<ProposalDetailVMType>> {
  return asResult(async () => {
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
  });
}

/** POST /v1/requests — Idempotency-Key required. */
export async function submitRequest(body: RequestBodyType, idempotencyKey: string): Promise<ApiResult<RequestVMType>> {
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? authMessage("VALIDATION"),
      code: "VALIDATION",
      status: 400,
    };
  }
  return asResult(async () => {
    const res = await apiFetch("/v1/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-App-Platform": appPlatform(),
        "X-App-Version": appVersion(),
      },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    const vm = RequestVM.safeParse(raw);
    if (!vm.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: vm.data };
  });
}

/** GET /v1/requests */
export async function fetchRequests(): Promise<ApiResult<{ items: RequestVMType[]; hasMore: boolean }>> {
  return asResult(async () => {
    const res = await apiFetch("/v1/requests");
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    const items = (raw as { items?: unknown })?.items;
    if (!Array.isArray(items)) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    // Row by row: one request this app cannot read must not take the others with it. The contract reads new states
    // and new fields as known ones (ADR-IMPL-042), so a dropped row means a server this app does not understand —
    // said in development, where it can be fixed; never a member's data in the message.
    const parsed: RequestVMType[] = [];
    let dropped = 0;
    let firstIssue = "";
    for (const row of items) {
      const v = RequestVM.safeParse(row);
      if (v.success) parsed.push(v.data);
      else {
        dropped += 1;
        if (!firstIssue) firstIssue = v.error.issues[0]?.path.join(".") ?? "";
      }
    }
    if (dropped > 0 && __DEV__) {
      console.warn(`[fetchRequests] ${dropped} of ${items.length} requests did not read (first at "${firstIssue}")`);
    }
    const hasMore = RequestList.shape.hasMore.catch(false).parse((raw as { hasMore?: unknown })?.hasMore);
    return { ok: true, data: { items: parsed, hasMore } };
  });
}

/** GET /v1/requests/:id */
export async function fetchRequest(id: string): Promise<ApiResult<RequestVMType>> {
  return asResult(async () => {
    const res = await apiFetch(`/v1/requests/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = await parseJson(res);
    const parsed = RequestVM.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: authMessage("UNKNOWN"), code: "VALIDATION", status: 500 };
    }
    return { ok: true, data: parsed.data };
  });
}

export type AppConfig = { minSupportedVersion: string; maintenance: string | null };

/** GET /v1/app-config — cold start, public. */
export async function fetchAppConfig(): Promise<ApiResult<AppConfig>> {
  return asResult(async () => {
    const res = await apiFetch("/v1/app-config");
    if (!res.ok) {
      return failFromBody(res, (await parseJson(res)) as { error?: { code?: string; message?: string } } | null);
    }
    const raw = (await parseJson(res)) as AppConfig;
    return {
      ok: true,
      data: {
        minSupportedVersion: raw.minSupportedVersion ?? "0.1.0",
        maintenance: raw.maintenance ?? null,
      },
    };
  });
}
