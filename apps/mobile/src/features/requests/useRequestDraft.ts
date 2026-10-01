import { useReducer } from "react";
import type { RequestBody, RequestLeg, Passengers } from "@bbc/shared/api/v1/requests";
import type { FareVM } from "@bbc/shared/api/v1/fares";
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

export function buildDraft(opts: {
  fare?: FareVM | null;
  profile?: Profile | null;
  fromCode?: string;
  toCode?: string;
  mode?: RequestMode;
  replacesFareId?: string;
}): RequestDraft {
  const from = opts.fare?.from.code ?? opts.fromCode ?? "JFK";
  const to = opts.fare?.to.code ?? opts.toCode ?? "LHR";
  const cabin = opts.fare?.cabin ?? "business";
  const mode: RequestMode = opts.mode ?? (opts.fare?.offerId ? "offer" : opts.fare ? "fare" : "quote");
  return {
    mode,
    tripType: "round",
    legs: [
      { from, to, date: "2026-10-12" },
      { from: to, to: from, date: "2026-10-19" },
    ],
    passengers: { adult: 1, child: 0, infant: 0 },
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
  if (draft.mode === "quote") return { ...shared, intent: "quote" };
  if (draft.mode === "alternative") return { ...shared, intent: "alternative", replacesFareId: draft.replacesFareId };
  if (draft.mode === "offer") return { ...shared, offerId: draft.offerId };
  return { ...shared, fareId: draft.fareId };
}

export function useRequestDraft(initial: RequestDraft) {
  const [state, dispatch] = useReducer(reducer, initial);
  return { state, dispatch };
}
