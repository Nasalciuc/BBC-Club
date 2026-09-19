import { eq } from "drizzle-orm";
import { memberFeatures, proposalCandidates } from "@bbc/db/schema/personalization";

export type PersonalizationFacade = ReturnType<typeof createPersonalizationFacade>;

export function createPersonalizationFacade(db: any) {
  return {
    async redactMember(tx: any, memberId: string) {
      const exec = tx ?? db;
      await exec.delete(memberFeatures).where(eq(memberFeatures.memberId, memberId));
      await exec.delete(proposalCandidates).where(eq(proposalCandidates.memberId, memberId));
    },
  };
}
