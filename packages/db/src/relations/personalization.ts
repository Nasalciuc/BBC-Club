// @ts-nocheck � drizzle-orm@1.0.0-rc.4 RQ typings; see packages/db/README.md
import type { RelationsBuilder } from "drizzle-orm";
import type * as schema from "../schema";

export const personalizationRelations = (r: RelationsBuilder<typeof schema>) => ({
  memberFeatures: {},
  proposalCandidates: {},
});
