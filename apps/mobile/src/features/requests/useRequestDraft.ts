import { useReducer } from "react";
import type { RequestBody, RequestLeg, Passengers } from "@bbc/shared/api/v1/requests";
import type { FareVM } from "@bbc/shared/api/v1/fares";
// The pure date helpers, not the component index: this module is imported by tests that run without React Native.
import { addDays, todayLocal } from "@bbc/ui/calendar-logic";
import { departYmd } from "@bbc/ui/flight-facts";
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
    case "setTripType":
      return {
        ...state,
        tripType: action.tripType,
        legs: legsForTripType(state.legs, action.tripType),
        returnError: null,
      };
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

/**
 * The legs a trip type keeps. One way keeps the outbound; back to Round trip, the return comes back without a date —
 * the member picks one (Figma 135:851 · return missing), never a same-day return they did not choose.
 */
export function legsForTripType(legs: RequestLeg[], tripType: TripType): RequestLeg[] {
  if (tripType === "oneway") return legs.slice(0, 1);
  const out = legs[0];
  if (!out || legs.length >= 2) return legs;
  return [out, { from: out.to, to: out.from, date: "" }];
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

/**
 * The days a request starts from. A fare is one flight: it is asked for on the day it leaves (`departYmd`, as its page
 * prints it), one way or round trip as the catalogue sells it — a round trip's return the one searched for when it
 * comes after that day, else a week later, still the member's to change. A fare without a day of its own takes the
 * searched day, else the suggestion, and still its trip. Without a fare: the dates chosen for this search, else the
 * suggestion (two weeks out, a week long). A day before today is never proposed.
 */
function draftDates(
  fare: Pick<FareVM, "departAt" | "departLocal" | "departDate" | "trip"> | null,
  search: SearchContext | null,
  today: string | undefined,
): { depart: string; ret: string | null; tripType: TripType } {
  const day = today ?? todayLocal();
  const suggested = defaultDates(day);
  // A day that has passed is no day to ask for (F006): a remembered search, or a fare that has already left.
  const searched = search?.dates.depart && search.dates.depart >= day ? search.dates : null;
  if (fare) {
    const own = departYmd(fare);
    const depart = (own && own >= day ? own : null) ?? searched?.depart ?? suggested.depart;
    const trip = fare.trip ?? (searched && !searched.return ? "one_way" : "round_trip");
    if (trip === "one_way") return { depart, ret: null, tripType: "oneway" };
    const back = searched?.return && searched.return > depart ? searched.return : null;
    return { depart, ret: back ?? addDays(depart, DEFAULT_TRIP_NIGHTS), tripType: "round" };
  }
  if (!searched?.depart) return { depart: suggested.depart, ret: suggested.ret, tripType: "round" };
  return { depart: searched.depart, ret: searched.return, tripType: searched.return ? "round" : "oneway" };
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
  const { depart, ret, tripType } = draftDates(opts.fare ?? null, opts.search ?? null, opts.today);
  // A one-way search chose no return: if the member turns it into a round trip, the return is theirs to pick.
  return {
    mode,
    tripType,
    legs: [
      { from, to, date: depart },
      { from: to, to: from, date: tripType === "oneway" ? "" : (ret ?? addDays(depart, DEFAULT_TRIP_NIGHTS)) },
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

/**
 * The sheet's title and its pill (06): `Request a quote` — a fare, an offer or a route alike, the specialist quotes the
 * trip; `Request an alternative` in place of a fare that has closed (21).
 */
export function sheetTitle(mode: RequestMode): string {
  return mode === "alternative" ? "Request an alternative" : "Request a quote";
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
