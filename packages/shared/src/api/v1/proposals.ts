import { z } from "zod";
import { parseMemberPhone } from "../../phone";
import { isIanaZone } from "../../time-zone";
import { Passengers } from "./requests";

// -- Price -------------------------------------------------------------------

export const PricePair = z.object({
  offer: z.number().positive(),
  published: z.number().positive().optional(),
  /** FTC evidence for a reference price — required whenever `published` is set (enforced at write sites). */
  publishedSource: z.string().optional(),
  currency: z.string().length(3),
});
export type PricePair = z.infer<typeof PricePair>;

// -- Flight facts ------------------------------------------------------------

export const FlightFactsVM = z.object({
  nonstop: z.boolean(),
  durationMinutes: z.number().int().positive(),
  product: z.string().optional(),
  carrier: z.string().optional(),
  flightNumber: z.string().optional(),
  departLocal: z.string().optional(),
  arriveLocal: z.string().optional(),
});
export type FlightFactsVM = z.infer<typeof FlightFactsVM>;

// -- Response state ----------------------------------------------------------

export const ResponseState = z.enum(["unseen", "interested", "dismissed"]);
export type ResponseState = z.infer<typeof ResponseState>;

// -- Card VM -----------------------------------------------------------------

export const ProposalCardVM = z.object({
  id: z.string().uuid(),
  title: z.string(),
  contextLine: z.string().optional(),
  route: z.object({ from: z.string().length(3), to: z.string().length(3) }),
  cabin: z.enum(["business", "first"]),
  price: PricePair,
  mediaUrl: z.string().url().optional(),
  mediaBlurhash: z.string().optional(),
  /** The offer's rating, as its card prints it beside the city (02, 16: `★ 4.8`): one to five, given by whoever made
   *  the offer. Null when it has none — no star is shown, none is made up (ADR-IMPL-056). Optional both ways; a value
   *  this app cannot read reads as none, and the card still shows. */
  rating: z.number().min(1).max(5).nullable().optional().catch(null),
  validUntil: z.string().datetime(),
  state: ResponseState,
  targeting: z.enum(["personal", "broadcast"]),
});
export type ProposalCardVM = z.infer<typeof ProposalCardVM>;

// -- Detail VM ---------------------------------------------------------------

export const ProposalDetailVM = ProposalCardVM.extend({
  body: z.string().optional(),
  flightFacts: FlightFactsVM.optional(),
  advisorName: z.string(),
});
export type ProposalDetailVM = z.infer<typeof ProposalDetailVM>;

// -- Feed VM -----------------------------------------------------------------

export const FeedVM = z.object({
  items: z.array(ProposalCardVM),
  cursor: z.object({ ts: z.string().datetime(), id: z.string().uuid() }).optional(),
  summary: z.object({ total: z.number().int(), personal: z.number().int() }),
});
export type FeedVM = z.infer<typeof FeedVM>;

// -- Inbox -------------------------------------------------------------------

export const InboxItemVM = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string().optional(),
  deepLink: z.string().optional(),
  offerId: z.string().uuid().optional(),
  category: z.enum(["transactional", "offers_personal", "offers_broadcast"]),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});
export type InboxItemVM = z.infer<typeof InboxItemVM>;

export const InboxVM = z.object({
  items: z.array(InboxItemVM),
  unreadCount: z.number().int(),
});
export type InboxVM = z.infer<typeof InboxVM>;

// -- Account -----------------------------------------------------------------

export const PasswordBody = z.object({
  newPassword: z.string().min(8).max(128),
  /** Required when the member already has a credential. Path A (first set) omits it. */
  currentPassword: z.string().min(1).max(128).optional(),
});
export type PasswordBody = z.infer<typeof PasswordBody>;

// -- Profile -----------------------------------------------------------------

/** Three letters, upper-cased — the request legs' rule (requests.ts). `.length(3)` let 'ßab' through (upper-cased to
 *  'SSAB', refused by CHECK profile_iata_len → 500) and stored 'L H'. Whether the airport exists is catalog's to say,
 *  and members (core) may not ask catalog (domain); Home answers home:null for a code it does not know. */
const IATA = /^[A-Za-z]{3}$/;

export const ProfilePatchBody = z
  .object({
    // Trimmed, never blank. 120 for CRM names; the request sheet's 2-80 is the app's rule.
    displayName: z.string().trim().min(1, { message: "Tell us your name." }).max(120).optional(),
    homeAirport: z.string().regex(IATA, { message: "Choose an airport from the list." }).toUpperCase().optional(),
    // Read by Intl for quiet hours: a zone it cannot read stopped every broadcast campaign (ADR-IMPL-058).
    timezone: z.string().min(1).max(80).refine(isIanaZone, { message: "Choose a time zone from the list." }).optional(),
    // Stored in E.164 (default country US), so a saved phone always passes RequestBody.contact.phone (7-20): typed as
    // '(212) 555-0101' it is '+12125550101'; an extension has no place in E.164 and is not kept.
    phone: z
      .string()
      .min(1)
      .max(30)
      .transform((raw, ctx) => {
        const { e164 } = parseMemberPhone(raw);
        if (!e164 || e164.length < 7 || e164.length > 20) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That phone number doesn't look right." });
          return z.NEVER;
        }
        return e164;
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be present",
  });
export type ProfilePatchBody = z.infer<typeof ProfilePatchBody>;

export const TravelPreferencesBody = z
  .object({
    // Airports as the home airport takes them, each once, in the order sent: ['lhr','LHR','cdg'] is ['LHR','CDG'].
    destinations: z
      .array(z.string().regex(IATA, { message: "Choose an airport from the list." }).toUpperCase())
      .max(3)
      .transform((codes) => [...new Set(codes)])
      .optional(),
    cabin: z.enum(["business", "first"]).optional(),
    frequency: z.enum(["monthly", "quarterly", "rarely"]).optional(),
    passengers: Passengers.optional(),
    notes: z.string().max(500).optional(),
  })
  // On the body, not on the shared Passengers: RequestVM and ProfileVM parse with Passengers, and a stored row that
  // breaks the rule must still read.
  .superRefine((b, ctx) => {
    if (b.passengers && b.passengers.infant > b.passengers.adult) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passengers", "infant"],
        message: "Each infant travels with an adult.",
      });
    }
  });
export type TravelPreferencesBody = z.infer<typeof TravelPreferencesBody>;

// -- Notification preferences ------------------------------------------------

export const NotificationPreferenceItem = z.object({
  category: z.enum(["offers_personal", "offers_broadcast"]),
  enabled: z.boolean(),
});
export const NotificationPreferencesBody = z.object({
  preferences: z.array(NotificationPreferenceItem).min(1),
});
export type NotificationPreferencesBody = z.infer<typeof NotificationPreferencesBody>;

// -- Devices -----------------------------------------------------------------

export const DeviceBody = z.object({
  deviceId: z.string().min(1).max(200),
  platform: z.enum(["ios", "android"]),
  nativeToken: z.string().min(1),
  expoToken: z.string().optional(),
  appVersion: z.string().optional(),
});
export type DeviceBody = z.infer<typeof DeviceBody>;
