/** The only import surface of @bbc/crm. Other modules and the host see nothing else. */
export type CrmFacade = ReturnType<typeof createCrmFacade>;
export function createCrmFacade(_deps: { db: unknown }) {
  return {};
}
