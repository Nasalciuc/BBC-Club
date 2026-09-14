/** The only import surface of @bbc/engagement. Other modules and the host see nothing else. */
export type EngagementFacade = ReturnType<typeof createEngagementFacade>;
export function createEngagementFacade(_deps: { db: unknown }) {
  return {};
}
