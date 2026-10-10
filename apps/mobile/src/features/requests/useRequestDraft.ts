import { useReducer } from "react";
import type { RequestBody, RequestLeg, Passengers } from "@bbc/shared/api/v1/requests";
import type { FareVM } from "@bbc/shared/api/v1/fares";
// The pure date helpers, not the component index: this module is imported by tests that run without React Native.
import { addDays, todayLocal } from "@bbc/ui/calendar-logic";
import type { Profile } from "@/lib/api";

export type TripType = "round" | "oneway";
export type RequestMode = "fare" | "offer" | "quote" | "alternative";

export type RequestDraft = {
  mode: RequestMode;
  tripType: TripType;
  legs: RequestLeg[];
  passengers: Passengers;
  cabin: "business" | "first";
  contact: { name: string; phone: string; email: string };
  note: string;
  fareId?: string;
  offerId?: string;
  replacesFareId?: string;
  priceAtRequest?: number;
  /** The route and cabin whose indicative fare Home showed before the member asked for a quote (ADR-IMPL-042); null
   *  when it showed none. The request says so only while it still asks about that route and cabin. */
  estimateFor: { from: string; to: string; cabin: "business" | "first" } | null;
  phoneError: string | null;
  returnError: string | null;
  submitError: string | null;
  phase: "form" | "confirm" | "saved";
  confirmedPhone: string | null;
  confirmedRoute: string | null;
  confirmedDates: string | null;
};

type Action =
  | { type: "reset"; draft: RequestDraft }
  | { type: "setTripType"; tripType: TripType }
  | { type: "setDepart"; date: string }
  | { type: "setReturn"; date: string }
  | { type: "setPassengers"; passengers: Passengers }
  | { type: "setContact"; field: "name" | "phone" | "email"; value: string }
  | { type: "setNote"; note: string }
  | { type: "setPhoneError"; error: string | null }
  | { type: "setReturnError"; error: string | null }
  | { type: "setSubmitError"; error: string | null }
  | {
      type: "confirm";
      phone: string;
      route: string;
      dates: string;
      saved?: boolean;
    };

function reducer(state: RequestDraft, action: Action): RequestDraft {
  switch (action.type) {
    case "reset":
      return action.draft;
    case "setTripType": {
      const legs =
        action.tripType === "oneway"
          ? state.legs.slice(0, 1)
          : state.legs.length >= 2
            ? state.legs
            : [
                state.legs[0]!,
                {
                  from: state.legs[0]!.to,
                  to: state.legs[0]!.from,
                  date: state.legs[0]!.date,
                },
              ];
      return { ...state, tripType: action.tripType, legs, returnError: null };
    }
    case "setDepart": {
      const legs = [...state.legs];
      if (legs[0]) legs[0] = { ...legs[0], date: action.date };
      return { ...state, legs };
    }
    case "setReturn": {
      const legs = [...state.legs];
      if (legs[1]) legs[1] = { ...legs[1], date: action.date };
      else if (legs[0]) {
        legs.push({ from: legs[0].to, to: legs[0].from, date: action.date });
      }
      return { ...state, legs, returnError: null };
    }
    case "setPassengers":
      return { ...state, passengers: action.passengers };
    case "setContact":
      return {
        ...state,
        contact: { ...state.contact, [action.field]: action.value },
        phoneError: action.field === "phone" ? null : state.phoneError,
      };
    case "setNote":
      return { ...state, note: action.note };
    case "setPhoneError":
      return { ...state, phoneError: action.error };
    case "setReturnError":
      return { ...state, returnError: action.error };
    case "setSubmitError":
      return { ...state, submitError: action.error };
    case "confirm":
      return {
        ...state,
        phase: action.saved ? "saved" : "confirm",
        confirmedPhone: action.phone,
        confirmedRoute: action.route,
        confirmedDates: action.dates,
        submitError: null,
      };
    default:
      return state;
  }
}

/** What Home already knows when it opens the sheet: the member's choices for this search (ADR-IMPL-041). */
export type SearchContext = {
  dates: { depart: string | null; return: string | null; flexible: boolean };
  cabin: "business" | "first";
  passengers: Passengers;
};

/** Suggested dates when none were chosen: two weeks out, a week long — never a fixed day that the calendar outgrows. */
export const DEFAULT_DEPART_IN_DAYS = 14;
export const DEFAULT_TRIP_NIGHTS = 7;

export function defaultDates(today: string = todayLocal()): { depart: string; ret: string } {
  const depart = addDays(today, DEFAULT_DEPART_IN_DAYS);
  return { depart, ret: addDays(depart, DEFAULT_TRIP_NIGHTS) };
}

export function buildDraft(opts: {
  fare?: FareVM | null;
  profile?: Profile | null;
  fromCode?: string;
  toCode?: string;
  mode?: RequestMode;
  replacesFareId?: string;
  search?: SearchContext | null;
  /** Home showed the indicative fare for this route and cabin (`EstimateRow`) when the member asked for a quote. */
  estimateShown?: boolean;
  today?: string;
}): RequestDraft {
  const from = opts.fare?.from.code ?? opts.fromCode ?? "JFK";
  const to = opts.fare?.to.code ?? opts.toCode ?? "LHR";
  // The fare's cabin wins; then the cabin chosen for this search; then the profile's usual cabin.
  const cabin = opts.fare?.cabin ?? opts.search?.cabin ?? opts.profile?.preferences?.cabin ?? "business";
  const passengers: Passengers = opts.search?.passengers ??
    opts.profile?.preferences?.passengers ?? { adult: 1, child: 0, infant: 0 };
  const mode: RequestMode = opts.mode ?? (opts.fare?.offerId ? "offer" : opts.fare ? "fare" : "quote");
  const suggested = defaultDates(opts.today);
  const depart = opts.search?.dates.depart ?? suggested.depart;
  const ret = opts.search?.dates.depart ? opts.search.dates.return : suggested.ret;
  const tripType: TripType = opts.search?.dates.depart && !opts.search.dates.return ? "oneway" : "round";
  return {
    mode,
    tripType,
    legs: [
      { from, to, date: depart },
      { from: to, to: from, date: ret ?? addDays(depart, DEFAULT_TRIP_NIGHTS) },
    ],
    passengers,
    cabin,
    contact: {
      name: opts.profile?.displayName ?? "",
      phone: opts.profile?.phone ?? "",
      email: opts.profile?.email ?? "",
    },
    note: "",
    fareId: mode === "fare" ? opts.fare?.id : undefined,
    offerId: mode === "offer" ? (opts.fare?.offerId ?? undefined) : undefined,
    replacesFareId: mode === "alternative" ? opts.replacesFareId : undefined,
    priceAtRequest: opts.fare?.price.offer,
    estimateFor: mode === "quote" && opts.estimateShown === true ? { from, to, cabin } : null,
    phoneError: null,
    returnError: null,
    submitError: null,
    phase: "form",
    confirmedPhone: null,
    confirmedRoute: null,
    confirmedDates: null,
  };
}

export function missingReturn(tripType: TripType, returnDate?: string): boolean {
  return tripType === "round" && (returnDate == null || returnDate.length === 0);
}

export function sheetTitle(mode: RequestMode): string {
  if (mode === "quote") return "Request a quote";
  if (mode === "alternative") return "Request an alternative";
  return "Request this fare";
}

/** The member saw an estimate for exactly what this quote asks about: the outbound route and the cabin. */
export function showedEstimate(draft: RequestDraft): boolean {
  const seen = draft.estimateFor;
  const outbound = draft.legs[0];
  return Boolean(
    seen && outbound && outbound.from === seen.from && outbound.to === seen.to && draft.cabin === seen.cabin,
  );
}

export function draftToBody(draft: RequestDraft): RequestBody {
  const legs = draft.tripType === "oneway" ? draft.legs.slice(0, 1) : draft.legs;
  const shared = {
    tripType: draft.tripType,
    cabin: draft.cabin,
    legs,
    passengers: draft.passengers,
    contact: draft.contact,
    note: draft.note || undefined,
    priceAtRequest: draft.priceAtRequest,
  };
  // A yes, never a number: the server recomputes the estimate, and only when the app says it showed one.
  if (draft.mode === "quote")
    return { ...shared, intent: "quote", ...(showedEstimate(draft) ? { estimateShown: true } : {}) };
  if (draft.mode === "alternative") return { ...shared, intent: "alternative", replacesFareId: draft.replacesFareId };
  if (draft.mode === "offer") return { ...shared, offerId: draft.offerId };
  return { ...shared, fareId: draft.fareId };
}

export function useRequestDraft(initial: RequestDraft) {
  const [state, dispatch] = useReducer(reducer, initial);
  return { state, dispatch };
}
