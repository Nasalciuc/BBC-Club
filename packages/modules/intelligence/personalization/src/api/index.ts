import type { Executor } from "@bbc/db";

/** The only import surface of @bbc/personalization. module.ts implements it; consumers import it. */
export type PersonalizationFacade = {
  redactMember(tx: Executor | undefined, memberId: string): Promise<void>;
};
