import { z } from "zod";
import { Passengers } from "./requests";

export const TravelPreferencesVM = z.object({
  destinations: z.array(z.string().length(3)).optional(),
  cabin: z.enum(["business", "first"]).optional(),
  frequency: z.enum(["monthly", "quarterly", "rarely"]).optional(),
  passengers: Passengers.optional(),
  notes: z.string().optional(),
});
export type TravelPreferencesVM = z.infer<typeof TravelPreferencesVM>;

export const ProfileVM = z.object({
  // Response VM (echo of the session actor), not a request body — lint rule is file-wide under api/.
  // eslint-disable-next-line bbc/no-member-id-in-request-schemas -- ProfileVM is outbound
  memberId: z.string(),
  /** `pending` = no profile row yet (BFF stub). */
  status: z.enum(["active", "waitlist", "deleted", "pending"]),
  /** Composed by the BFF from the principal when available; null until honest-app adds it. */
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  homeAirport: z.string().length(3).nullable(),
  timezone: z.string(),
  phone: z.string().nullable(),
  /** Null only on the no-row pending stub. */
  memberSince: z.string().datetime().nullable(),
  crmLinkedAt: z.string().datetime().nullable(),
  crmLinked: z.boolean(),
  preferences: TravelPreferencesVM,
});
export type ProfileVM = z.infer<typeof ProfileVM>;
