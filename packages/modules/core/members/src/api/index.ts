/** The only import surface of @bbc/members. Other modules and the host see nothing else. */
export type MembersFacade = ReturnType<typeof createMembersFacade>;
export function createMembersFacade(_deps: { db: unknown }) {
  return {};
}
