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
};

/** Mock until Dan grants access. The http adapter and the mirror sync are stage 5. */
export function mockCrm(
  known: { email: string; crmClientId: string; fullName?: string; homeAirport?: string }[] = [],
): CrmConnector {
  return {
    async findByEmail(e) {
      const k = known.find((c) => c.email.toLowerCase() === e);
      return k ? { crmClientId: k.crmClientId, fullName: k.fullName, homeAirport: k.homeAirport } : null;
    },
    async createActivity(i) {
      return { id: `mock_${i.externalId}` };
    },
  };
}

export const crmModule = (override?: CrmConnector): ModuleDescriptor<Record<string, never>, CrmConnector> => ({
  name: "crm",
  layer: "integration",
  init: () => {
    // CRM_ADAPTER is not in ServerEnv yet (it joins env.ts in stage 5); read it directly with a safe default.
    const adapter = process.env.CRM_ADAPTER ?? "mock";
    if (!override && adapter === "http") throw new Error("CRM http adapter is stage 5; set CRM_ADAPTER=mock");
    return { exposes: override ?? mockCrm(), routes: [], consumers: [], jobs: [] };
  },
});
