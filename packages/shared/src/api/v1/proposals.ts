import { z } from "zod";

// -- Price -------------------------------------------------------------------

export const PricePair = z.object({
  offer: z.number().positive(),
  published: z.number().positive().optional(),
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
});
export type PasswordBody = z.infer<typeof PasswordBody>;

// -- Profile -----------------------------------------------------------------

export const ProfilePatchBody = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    homeAirport: z.string().length(3).optional(),
    timezone: z.string().min(1).max(80).optional(),
    phone: z.string().min(1).max(30).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be present",
  });
export type ProfilePatchBody = z.infer<typeof ProfilePatchBody>;

export const TravelPreferencesBody = z.object({
  destinations: z.array(z.string().length(3)).max(3).optional(),
  cabin: z.enum(["business", "first"]).optional(),
  frequency: z.enum(["monthly", "quarterly", "rarely"]).optional(),
  notes: z.string().max(500).optional(),
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
