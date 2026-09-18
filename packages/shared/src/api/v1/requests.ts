import { z } from "zod";
import { isMemberPhone } from "../../phone";

/** date = YYYY-MM-DD only — never an ISO timestamp (a local 21:00 must not become tomorrow). */
export const RequestLeg = z.object({
  from: z.string().length(3).toUpperCase(),
  to: z.string().length(3).toUpperCase(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  })
  .refine((b) => !(b.fareId && b.offerId), {
    message: "a request comes from a fare or an offer, never both",
  });
export type RequestBody = z.infer<typeof RequestBody>;

export const RequestVM = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  route: z.string(),
  dates: z.string(),
  cabin: z.enum(["business", "first"]),
  passengers: Passengers,
  priceAtRequest: z.number().nullable(),
  status: z.enum(["received", "assigned", "quoted", "booked", "closed", "not_sent"]),
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
