import { eq } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { memberFeatures, proposalCandidates } from "@bbc/db/schema/personalization";
import type { PersonalizationFacade } from "../api";

/** Implementation — imported by module.ts and handlers, not via api/index.ts as a factory. */
export function createPersonalizationFacade(db: Executor): PersonalizationFacade {
  return {
    async redactMember(tx: Executor | undefined, memberId: string) {
      const exec = tx ?? db;
      await exec.delete(memberFeatures).where(eq(memberFeatures.memberId, memberId));
      await exec.delete(proposalCandidates).where(eq(proposalCandidates.memberId, memberId));
    },
  };
}
