import type { RelationsBuilder } from "drizzle-orm";
import type * as schema from "../schema";

export const personalizationRelations = (r: RelationsBuilder<typeof schema>) => ({
  memberFeatures: {},
  proposalCandidates: {},
});
