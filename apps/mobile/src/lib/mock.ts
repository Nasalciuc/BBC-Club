import { fixture } from "@bbc/shared/fixture";
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
  RequestBody,
  RequestVM,
  type RequestBody as RequestBodyType,
  type RequestVM as RequestVMType,
} from "@bbc/shared/api/v1/requests";

/** Mirrors ApiResult in api.ts — type-only to avoid a runtime cycle. */
type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: string; status: number };

const MOCK_ETAG = 'W/"fixture-home-v1"';
const DELAY_MS = 400;

type AppConfig = { minSupportedVersion: string; maintenance: string | null };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** In-memory request list — starts from the shared fixture, never a second dataset. */
let requestStore: RequestVMType[] = fixture.requests.map((r) => RequestVM.parse(r));
const idempotencyIndex = new Map<string, string>();

function formatDates(legs: RequestBodyType["legs"]): string {
  if (legs.length === 0) return "";
  const first = new Date(`${legs[0]!.date}T12:00:00`);
  const last = legs.length > 1 ? new Date(`${legs[legs.length - 1]!.date}T12:00:00`) : null;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return last ? `${fmt(first)}–${fmt(last).replace(/^[A-Za-z]+ /, "")}` : fmt(first);
}

export async function fetchHome(
  etag?: string | null,
): Promise<ApiResult<{ home: HomeVMType; etag: string | null; notModified: boolean }>> {
  await sleep(DELAY_MS);
  if (etag === MOCK_ETAG) {
    return { ok: true, data: { home: HomeVM.parse(fixture.home), etag: MOCK_ETAG, notModified: true } };
  }
  return { ok: true, data: { home: HomeVM.parse(fixture.home), etag: MOCK_ETAG, notModified: false } };
}

export async function searchFares(q: {
  from: string;
  to: string;
  cabin: "business" | "first";
}): Promise<ApiResult<SearchResultVMType>> {
  await sleep(DELAY_MS);
  const fromAirport = fixture.airports.find((a) => a.code === q.from);
  const toAirport = fixture.airports.find((a) => a.code === q.to);
  if (!fromAirport || !toAirport) {
    return { ok: false, message: "Unknown airport", code: "VALIDATION", status: 400 };
  }
  const items = fixture.fares
    .filter((f) => f.from.code === q.from && f.to.code === q.to && f.cabin === q.cabin)
    .filter((f) => new Date(f.validUntil).getTime() > Date.now())
    .map((f) => FareVM.parse(f));
  return {
    ok: true,
    data: SearchResultVM.parse({
      from: AirportVM.parse(fromAirport),
      to: AirportVM.parse(toAirport),
      items,
      offer: null,
    }),
  };
}

export async function fetchAirports(query: string): Promise<ApiResult<AirportVMType[]>> {
  await sleep(DELAY_MS);
  const term = query.trim().toUpperCase();
  if (term.length < 2) return { ok: true, data: [] };
  const matches = fixture.airports
    .filter((a) => a.code === term || a.city.toUpperCase().startsWith(term) || a.name.toUpperCase().includes(term))
    .slice(0, 8)
    .map((a) => AirportVM.parse(a));
  return { ok: true, data: matches };
}

export async function fetchFare(id: string): Promise<ApiResult<FareVMType>> {
  await sleep(DELAY_MS);
  const row = fixture.fares.find((f) => f.id === id);
  if (!row) return { ok: false, message: "Not found", code: "NOT_FOUND", status: 404 };
  if (new Date(row.validUntil).getTime() <= Date.now()) {
    return { ok: false, message: "This fare has closed", code: "GONE", status: 410 };
  }
  return { ok: true, data: FareVM.parse(row) };
}

export async function submitRequest(body: unknown, idempotencyKey: string): Promise<ApiResult<RequestVMType>> {
  await sleep(DELAY_MS);
  const existingId = idempotencyIndex.get(idempotencyKey);
  if (existingId) {
    const existing = requestStore.find((r) => r.id === existingId);
    if (existing) return { ok: true, data: existing };
  }
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid request",
      code: "VALIDATION",
      status: 400,
    };
  }
  const data = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const route = `${data.legs[0]!.from} → ${data.legs[data.legs.length - 1]!.to}`;
  const vm = RequestVM.parse({
    id,
    reference: `R-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
    route,
    dates: formatDates(data.legs),
    cabin: data.cabin,
    passengers: data.passengers,
    priceAtRequest: data.priceAtRequest ?? null,
    status: "received",
    createdAt: now,
    timeline: [{ status: "received", at: now, note: null }],
  });
  requestStore = [vm, ...requestStore];
  idempotencyIndex.set(idempotencyKey, id);
  return { ok: true, data: vm };
}

export async function fetchRequests(): Promise<ApiResult<{ items: RequestVMType[] }>> {
  await sleep(DELAY_MS);
  return { ok: true, data: { items: requestStore.map((r) => RequestVM.parse(r)) } };
}

export async function fetchAppConfig(): Promise<ApiResult<AppConfig>> {
  await sleep(DELAY_MS);
  return { ok: true, data: { minSupportedVersion: "0.1.0", maintenance: null } };
}

/** Re-export for offline queue retry — marks not_sent as received after a successful flush. */
export function markRequestSent(id: string): void {
  requestStore = requestStore.map((r) =>
    r.id === id && r.status === "not_sent"
      ? RequestVM.parse({
          ...r,
          status: "received",
          timeline: [...r.timeline, { status: "received", at: new Date().toISOString(), note: null }],
        })
      : r,
  );
}

export function enqueueNotSent(body: RequestBodyType): RequestVMType {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const route = `${body.legs[0]!.from} → ${body.legs[body.legs.length - 1]!.to}`;
  const vm = RequestVM.parse({
    id,
    reference: `R-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
    route,
    dates: formatDates(body.legs),
    cabin: body.cabin,
    passengers: body.passengers,
    priceAtRequest: body.priceAtRequest ?? null,
    status: "not_sent",
    createdAt: now,
    timeline: [{ status: "not_sent", at: now, note: "Saved offline — tap to send" }],
  });
  requestStore = [vm, ...requestStore];
  return vm;
}

/** Test helper — unused in production screens. */
export function _resetMockStore(): void {
  requestStore = fixture.requests.map((r) => RequestVM.parse(r));
  idempotencyIndex.clear();
}
