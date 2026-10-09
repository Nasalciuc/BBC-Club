import { z } from "zod";
import { isMemberPhone } from "../../phone";
import { calendarDay } from "../../requests/display";

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
      name: z.string().min(2).max(80),
      phone: z.string().min(7).max(20).refine(isMemberPhone, {
        message: "That phone number doesn't look right.",
      }),
      email: z.string().email(),
    }),
    note: z.string().max(500).optional(),
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
