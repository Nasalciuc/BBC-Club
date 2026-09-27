import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import type { EmailFacade } from "@bbc/email";
import type { CrmFacade, CrmCallOpts } from "./api";
import { emailCrm } from "./infrastructure/email-crm";

export type { CrmFacade, CrmCallOpts };
/** @deprecated Prefer CrmFacade — same shape. */
export type CrmConnector = CrmFacade;

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
export function withCrmTimeout(adapter: CrmFacade, ms = CRM_TIMEOUT_MS): CrmFacade {
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
): CrmFacade {
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

export const crmModule = (override?: CrmFacade): ModuleDescriptor<{ email: EmailFacade }, CrmFacade> => ({
  name: "crm",
  layer: "integration",
  needs: ["email"],
  init: ({ env, ports }) => {
    if (override) return { exposes: withCrmTimeout(override), routes: [], consumers: [], jobs: [] };
    if (env.CRM_ADAPTER === "http") throw new Error("CRM http adapter is stage 5; set CRM_ADAPTER=mock");
    if (env.CRM_ADAPTER === "email") {
      if (!env.OPERATORS_EMAIL) throw new Error("OPERATORS_EMAIL is required when CRM_ADAPTER=email");
      return {
        exposes: withCrmTimeout(emailCrm({ email: ports.email, operatorsEmail: env.OPERATORS_EMAIL })),
        routes: [],
        consumers: [],
        jobs: [],
      };
    }
    return { exposes: withCrmTimeout(mockCrm()), routes: [], consumers: [], jobs: [] };
  },
});
