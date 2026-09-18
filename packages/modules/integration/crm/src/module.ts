import type { ModuleDescriptor } from "@bbc/shared/module-contract";

export type CrmCallOpts = { signal?: AbortSignal };

export type CrmConnector = {
  findByEmail(
    emailNormalized: string,
    opts?: CrmCallOpts,
  ): Promise<{ crmClientId: string; fullName?: string; homeAirport?: string } | null>;
  createActivity(
    input: {
      externalId: string;
      memberId: string;
      offerId: string;
      kind: "interested" | "dismissed";
    },
    opts?: CrmCallOpts,
  ): Promise<{ id: string | null }>;
  submitRequest(payload: unknown, opts?: CrmCallOpts): Promise<{ crmRequestId: string }>;
};

const CRM_TIMEOUT_MS = 5000;

/** Partner slower than this is an outage. Fail fast and retry; do not hold a pooled connection. */
export class CrmTimeoutError extends Error {
  readonly code = "CRM_TIMEOUT" as const;
  constructor(method: string, ms = CRM_TIMEOUT_MS) {
    super(`CRM ${method} timed out after ${ms}ms`);
    this.name = "CrmTimeoutError";
  }
}

async function raceAbort<T>(method: string, signal: AbortSignal, work: Promise<T>, ms: number): Promise<T> {
  if (signal.aborted) throw new CrmTimeoutError(method, ms);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new CrmTimeoutError(method, ms));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** Every outbound CRM call gets a ceiling, including mocks — a hanging adapter is an outage. */
export function withCrmTimeout(adapter: CrmConnector, ms = CRM_TIMEOUT_MS): CrmConnector {
  const run = <T>(method: string, opts: CrmCallOpts | undefined, work: (signal: AbortSignal) => Promise<T>) => {
    const signal = opts?.signal ?? AbortSignal.timeout(ms);
    return raceAbort(method, signal, work(signal), ms);
  };
  return {
    findByEmail: (email, opts) => run("findByEmail", opts, (signal) => adapter.findByEmail(email, { signal })),
    createActivity: (input, opts) => run("createActivity", opts, (signal) => adapter.createActivity(input, { signal })),
    submitRequest: (payload, opts) =>
      run("submitRequest", opts, (signal) => adapter.submitRequest(payload, { signal })),
  };
}

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
    return { exposes: withCrmTimeout(override ?? mockCrm()), routes: [], consumers: [], jobs: [] };
  },
});
