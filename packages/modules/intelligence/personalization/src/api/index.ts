/** The only import surface of @bbc/personalization. module.ts implements it; consumers import it. */
export type PersonalizationFacade = {
  redactMember(tx: unknown, memberId: string): Promise<void>;
};
