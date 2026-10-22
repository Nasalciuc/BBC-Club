import type { RequestVM } from "@bbc/shared/api/v1/requests";

import { travelersLabel } from "../explore/travel-preferences";

import type { RequestSource } from "./confirmation-logic";

/**
 * What `Request received` (08) shows of the request just sent: the sheet hands it over here, in memory, keyed by the
 * request's id (or, saved offline, its queued key) — never in the page's URL. Params persist in navigation state and
 * a link can carry any (F014: a forged page with someone's phone, city and remote pictures); the page reads only its
 * id and whether it was queued, and loads a picture only from what the sheet handed over.
 */
export type ConfirmationModel = {
  source: RequestSource;
  /** The destination's city by name, for `London is next.`; empty when only a code is known. */
  city: string;
  /** The number this request will be called on, as a person reads it; empty when none was sent. */
  phone: string;
  from: string;
  to: string;
  cabin: "business" | "first";
  trip: "round" | "oneway" | "multi" | "";
  dates: string;
  travelers: string;
  carrier: { name: string; code: string | null; logoUrl: string | null } | null;
  /** The offer's own picture (from the server, via the sheet); null — the city's photograph. */
  media: string | null;
};

/** A few confirmations are kept: the last one opened, and those still under it on the stack. */
export const CONFIRMATION_KEEP = 5;
const handed = new Map<string, ConfirmationModel>();

export function putConfirmation(key: string, model: ConfirmationModel): void {
  handed.delete(key);
  handed.set(key, model);
  while (handed.size > CONFIRMATION_KEEP) {
    const oldest = handed.keys().next().value;
    if (oldest === undefined) break;
    handed.delete(oldest);
  }
}

/** The confirmation handed over for this key; null for one this run of the app never made (a relaunch, a link). Not
 *  consumed: a page renders more than once. */
export function readConfirmation(key: string): ConfirmationModel | null {
  return key ? (handed.get(key) ?? null) : null;
}

/** Tests: a new run of the app. */
export function clearConfirmations(): void {
  handed.clear();
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * All the page reads from its params: the request's id (or queued key), whether it was saved on the phone, and — saved —
 * whether the club's server did not answer while the phone was online (`why=unreachable`), never worded "offline" (F110).
 */
export function confirmationRoute(params: Record<string, string | string[] | undefined>): {
  id: string;
  queued: boolean;
  unreachable: boolean;
} {
  const queued = one(params.queued) === "1";
  return { id: one(params.id) ?? "", queued, unreachable: queued && one(params.why) === "unreachable" };
}

/** A request's id on the server; a request saved offline is keyed by its queued key instead. */
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The request the page may read and open (`View request`): one that was sent — never one saved offline, which the
 * server does not have yet — and only by an id shaped as the server's, never whatever else a link put in the URL.
 */
export function sentRequestId(route: { id: string; queued: boolean }): string | null {
  return !route.queued && REQUEST_ID.test(route.id) ? route.id : null;
}

/**
 * The confirmation from the request itself (GET /v1/requests/:id) when nothing was handed over: the server's own
 * words — no picture but the city's.
 */
export function confirmationFromRequest(vm: RequestVM, phone: string | null): ConfirmationModel {
  const ends = /^([A-Z]{3}) → ([A-Z]{3})$/.exec(vm.route);
  return {
    source: "search",
    city: vm.city ?? "",
    phone: phone ?? "",
    from: ends?.[1] ?? "",
    to: ends?.[2] ?? "",
    cabin: vm.cabin,
    trip: vm.tripType ?? "",
    dates: vm.dates,
    travelers: travelersLabel(vm.passengers),
    carrier: vm.carrier ? { name: vm.carrier.name, code: vm.carrier.code, logoUrl: null } : null,
    media: null,
  };
}
