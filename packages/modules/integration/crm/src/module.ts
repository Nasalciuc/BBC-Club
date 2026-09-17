import type { ModuleDescriptor } from "@bbc/shared/module-contract";

export type CrmConnector = {
  findByEmail(
    emailNormalized: string,
  ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
  createActivity(input: {
    externalId: string;
    memberId: string;
    offerId: string;
    kind: "interested" | "dismissed";
  }): Promise<{ id: string | null }>;
  submitRequest(payload: unknown): Promise<{ crmRequestId: string }>;
};

/** Mock until Dan grants access. The http adapter and the mirror sync are stage 5. */
export function mockCrm(
  known: { email: string; crmClientId: string; fullName?: string; homeAirport?: string }[] = [],
): CrmConnector {
  const activities = new Map<string, { id: string }>();
  let submitCount = 0;
  return {
    async findByEmail(e) {
      const k = known.find((c) => c.email.toLowerCase() === e);
      return k ? { crmClientId: k.crmClientId, fullName: k.fullName, homeAirport: k.homeAirport } : null;
    },
    async createActivity(i) {
      const existing = activities.get(i.externalId);
      if (existing) return existing;
      const created = { id: `mock_${i.externalId}` };
      activities.set(i.externalId, created);
      return created;
    },
    async submitRequest(_payload: unknown) {
      submitCount += 1;
      return { crmRequestId: `mock_req_${submitCount}` };
    },
  };
}

export const crmModule = (override?: CrmConnector): ModuleDescriptor<Record<string, never>, CrmConnector> => ({
  name: "crm",
  layer: "integration",
  init: ({ env }) => {
    const adapter = env.CRM_ADAPTER as "mock" | "http";
    if (!override && adapter === "http") throw new Error("CRM http adapter is stage 5; set CRM_ADAPTER=mock");
    return { exposes: override ?? mockCrm(), routes: [], consumers: [], jobs: [] };
  },
});
