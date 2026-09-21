import { eq } from "drizzle-orm";
import { memberFeatures, proposalCandidates } from "@bbc/db/schema/personalization";
import type { PersonalizationFacade } from "../api";

/** Implementation — imported by module.ts and handlers, not via api/index.ts as a factory. */
export function createPersonalizationFacade(db: any): PersonalizationFacade {
  return {
    async redactMember(tx: unknown, memberId: string) {
      const exec = (tx ?? db) as {
        delete: (t: unknown) => { where: (c: unknown) => Promise<unknown> };
      };
      await exec.delete(memberFeatures).where(eq(memberFeatures.memberId, memberId));
      await exec.delete(proposalCandidates).where(eq(proposalCandidates.memberId, memberId));
    },
  };
}
