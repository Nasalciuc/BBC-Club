import type { RelationsBuilder } from "drizzle-orm";
import type * as schema from "../schema";

/** proposals.offers ⇄ proposals.offer_targets — same schema, same module. */
export const proposalsRelations = (r: RelationsBuilder<typeof schema>) => ({
  offers: {
    targets: r.many.offerTargets({ from: r.offers.id, to: r.offerTargets.offerId }),
  },
  offerTargets: {
    offer: r.one.offers({ from: r.offerTargets.offerId, to: r.offers.id, optional: false }),
  },
});
