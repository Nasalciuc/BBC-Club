import { z } from "zod";
import { isMemberPhone } from "../../phone";
import { calendarDay } from "../../requests/display";
import { NOT_STORABLE, storable } from "./text";

/** An airport is three letters (IATA), upper-cased (`jfk` reads as JFK): the code is the route, the title and the push
 *  (ADR-IMPL-042). */
const IATA = /^[A-Za-z]{3}$/;

/** date = YYYY-MM-DD only — never an ISO timestamp (a local 21:00 must not become tomorrow) — and a real day. */
export const RequestLeg = z.object({
  from: z.string().regex(IATA).toUpperCase(),
  to: z.string().regex(IATA).toUpperCase(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => calendarDay(d) !== null, { message: "Choose a date on the calendar." }),
});
export type RequestLeg = z.infer<typeof RequestLeg>;

/** Passengers is an object, not a count. */
export const Passengers = z.object({
  adult: z.number().int().min(1).max(9),
  child: z.number().int().min(0).max(8),
  infant: z.number().int().min(0).max(4),
});
export type Passengers = z.infer<typeof Passengers>;

/**
 * Why a request cannot be taken, for the refusals an app on phones can meet — an older app checks less before it sends,
 * and a request kept on the phone ages. Each such issue carries its reason (`params.reason`), and the server answers it
 * in `error.context.reason` and in its line of `error.details`, beside a message already in the club's voice
 * (ADR-IMPL-071). Stable: an app maps a reason to its own words and to the field to open; one it does not know reads as
 * none, and it shows the message.
 */
export const REQUEST_REFUSAL_REASONS = [
  /** A leg on a day already over everywhere (`SubmittedRequestBody`): a recent search's remembered day, a queued request. */
  "day_passed",
  /** A leg that ends where it starts. */
  "same_airport",
  /** More infants than adults: each travels on an adult's lap. */
  "infants_over_adults",
  /** A leg before the one before it. */
  "dates_out_of_order",
  /** A round trip that is not there and back. */
  "round_trip",
  /** One way that is not one leg, a multi-city trip that is not two to six. */
  "legs_count",
] as const;
export type RequestRefusalReason = (typeof REQUEST_REFUSAL_REASONS)[number];

/**
 * A trip that can be flown: a round trip is two legs, the second the first reversed; one way is one leg; multi-city two
 * to six; no leg ends where it starts; each leg on or after the one before; an infant travels on an adult's lap, so no
 * more infants than adults (here, not on `Passengers`, which views parse too). What the member typed is checked where
 * it is declared: the contact and the note refuse a character `text` cannot keep (`./text` `storable`).
 * Each issue names its field (`legs.1.date`, `passengers.infant`), so the app can point at it. Nothing here depends on
 * today: a request kept on the phone (the offline queue parses `RequestBody`) stays readable as its day passes — the
 * server refuses a past day (`SubmittedRequestBody`), and the app asks the member to call.
 */
function tripIssues(
  b: {
    tripType: "round" | "oneway" | "multi";
    legs: { from: string; to: string; date: string }[];
    passengers: { adult: number; infant: number };
    contact: { name: string; phone: string; email: string };
    note?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const issue = (path: (string | number)[], message: string, reason: RequestRefusalReason) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message, params: { reason } });
  const legs = b.legs;
  if (b.tripType === "round") {
    const [out, back] = legs;
    if (legs.length !== 2 || !out || !back)
      issue(["legs"], "A round trip has two flights: there and back.", "round_trip");
    else if (back.from !== out.to || back.to !== out.from) {
      issue(["legs", 1], "A round trip comes back the way it went.", "round_trip");
    }
  }
  if (b.tripType === "oneway" && legs.length !== 1) issue(["legs"], "A one-way trip has one flight.", "legs_count");
  if (b.tripType === "multi" && (legs.length < 2 || legs.length > 6)) {
    issue(["legs"], "A multi-city trip has two to six flights.", "legs_count");
  }
  legs.forEach((leg, i) => {
    if (leg.from === leg.to) {
      issue(["legs", i, "to"], "Choose a destination other than where the flight leaves from.", "same_airport");
    }
    const before = legs[i - 1];
    if (before && leg.date < before.date) {
      issue(["legs", i, "date"], "Choose a date on or after the flight before.", "dates_out_of_order");
    }
  });
  if (b.passengers.infant > b.passengers.adult) {
    issue(
      ["passengers", "infant"],
      "Each infant travels on an adult's lap. Add an adult or remove an infant.",
      "infants_over_adults",
    );
  }
}

/** The first day a leg may be on: yesterday in UTC — today, or later, somewhere every member may be. */
export function earliestLegDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export const RequestBody = z
  .object({
    fareId: z.string().uuid().optional(),
    offerId: z.string().uuid().optional(),
    tripType: z.enum(["round", "oneway", "multi"]),
    /** Our enum; the CRM adapter maps to "Business Class" / "First Class". */
    cabin: z.enum(["business", "first"]),
    legs: z.array(RequestLeg).min(1).max(6),
    passengers: Passengers,
    contact: z.object({
      name: z.string().min(2).max(80).refine(storable, NOT_STORABLE),
      phone: z
        .string()
        .min(7)
        .max(20)
        .refine(isMemberPhone, {
          message: "That phone number doesn't look right.",
        })
        .refine(storable, NOT_STORABLE),
      email: z.string().email().refine(storable, NOT_STORABLE),
    }),
    note: z.string().max(500).refine(storable, NOT_STORABLE).optional(),
    priceAtRequest: z.number().positive().optional(),
    intent: z.enum(["quote", "alternative"]).optional(),
    replacesFareId: z.string().uuid().optional(),
    /** The app showed the indicative fare for this route and cabin before the member asked for a quote (ADR-IMPL-042).
     *  A yes, never a number: the server recomputes the estimate, and only when this is true — an app that does not
     *  say so (an older one, a dated search, an offer card) gets none, so an e-mail never claims an estimate the
     *  member did not see. */
    estimateShown: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    tripIssues(b, ctx);
    if (b.fareId && b.offerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a request comes from a fare or an offer, never both",
      });
    }
    if (b.intent && (b.fareId || b.offerId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A quote or an alternative doesn't include a fare or an offer.",
      });
    }
    if (b.intent === "alternative" && !b.replacesFareId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tell us which fare this replaces.",
      });
    }
    if (b.replacesFareId && b.intent !== "alternative") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only an alternative names a fare to replace.",
      });
    }
  });
export type RequestBody = z.infer<typeof RequestBody>;

/** What the server takes: `RequestBody`, and no leg on a day already over everywhere (before `earliestLegDay`). Kept
 *  out of `RequestBody` itself: that one is parsed again from the phone's storage, where a request must stay readable
 *  after its day so the server can refuse it and the app ask the member to call. */
export const SubmittedRequestBody = RequestBody.superRefine((b, ctx) => {
  const earliest = earliestLegDay();
  b.legs.forEach((leg, i) => {
    if (leg.date < earliest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legs", i, "date"],
        message: "That day has passed. Choose a date from today on.",
        params: { reason: "day_passed" satisfies RequestRefusalReason },
      });
    }
  });
});

export const RequestVM = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  /** `JFK → LHR`: the outbound leg (a round trip's last leg comes home). */
  route: z.string(),
  /** The destination's city, for the title (Figma 233:4069: `London`). Null when the airport is unknown; optional so
   *  an app reads an older server, and an older app ignores it (ADR-IMPL-042). */
  city: z.string().nullable().optional().catch(null),
  /** Round trip, one way or multi-city — the detail's facts line (Figma 233:4171: `ROUND TRIP`). Optional both ways; a
   *  kind this app does not know reads as none, so the request still lists. */
  tripType: z.enum(["round", "oneway", "multi"]).optional().catch(undefined),
  /** The number the specialist calls: the request's own contact phone, the member's (Figma 233:4242, `WE WILL CALL`).
   *  Optional both ways; a value this app cannot read reads as none, so the request still lists. */
  phone: z.string().nullable().optional().catch(null),
  dates: z.string(),
  cabin: z.enum(["business", "first"]),
  passengers: Passengers,
  priceAtRequest: z.number().nullable(),
  /** The fare's published price and its source when the member asked, recorded by the server from the fare — never
   *  from the app; the detail strikes it beside the fare once the quote is ready (Figma 233:4204: `$7,850 · BA
   *  PUBLISHED · 16 SEP`). Null on a request made from an offer or as a quote, or without one. Optional both ways; a
   *  value this app cannot read reads as none — a struck price never shows without its source (ADR-IMPL-046). */
  publishedAtRequest: z
    .object({ amount: z.number().positive(), source: z.string().trim().min(1) })
    .nullable()
    .optional()
    .catch(null),
  /** The airline the request was made for: its fare's carrier as it stood when the member asked, recorded by the server
   *  from the fare — never from the app (08: the airline on the trip's card; 11: `JFK → LHR · British Airways · 1
   *  adult`). `code` is null when the fare names its airline without one. Null on a request made from an offer or as a
   *  quote, or from a fare that names none. Optional both ways; a value this app cannot read reads as none
   *  (ADR-IMPL-056). */
  carrier: z
    .object({ code: z.string().length(2).nullable(), name: z.string().trim().min(1) })
    .nullable()
    .optional()
    .catch(null),
  /** A state a newer server adds reads as received in an older app — the request stays on the list instead of
   *  vanishing from it (the app parses rows one by one and drops those that fail). */
  status: z.enum(["received", "assigned", "quoted", "booked", "closed", "not_sent"]).catch("received"),
  createdAt: z.string().datetime(),
  timeline: z.array(
    z.object({
      status: z.string(),
      at: z.string().datetime(),
      note: z.string().nullable(),
    }),
  ),
});
export type RequestVM = z.infer<typeof RequestVM>;

export const RequestList = z.object({
  items: z.array(RequestVM),
  hasMore: z.boolean(),
});
export type RequestList = z.infer<typeof RequestList>;
