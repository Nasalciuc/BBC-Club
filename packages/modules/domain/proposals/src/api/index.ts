/** The only import surface of @bbc/proposals. Other modules and the host see nothing else. */
export type ProposalsFacade = ReturnType<typeof createProposalsFacade>;
export function createProposalsFacade(_deps: { db: unknown }) {
  return {};
}
