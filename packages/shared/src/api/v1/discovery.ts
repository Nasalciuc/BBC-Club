import { z } from "zod";

import { AirportVM } from "./fares";

/**
 * "Popular from <city>" (ADR-IMPL-039): destinations from an origin — routes members searched at least five times in
 * the last seven days, then the club's busiest hubs. Names only: a count never leaves the server. The server sends at
 * most four; no upper bound here, so a later server that sends more never breaks an older app — it shows what fits.
 */
export const PopularVM = z.object({
  from: AirportVM,
  destinations: z.array(AirportVM),
});
export type PopularVM = z.infer<typeof PopularVM>;

/** The home airport suggested at onboarding (ADR-IMPL-039): the busiest airport in the phone's time zone, or null. */
export const HomeSuggestionVM = z.object({
  airport: AirportVM.nullable(),
});
export type HomeSuggestionVM = z.infer<typeof HomeSuggestionVM>;
