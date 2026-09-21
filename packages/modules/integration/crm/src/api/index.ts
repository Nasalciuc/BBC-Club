/** Match from CRM by normalised email. */
export type CrmMatch = { crmClientId: string; fullName?: string; homeAirport?: string };

export type CrmCallOpts = { signal?: AbortSignal };

export type CrmSubmitResult = { crmRequestId: string };

/** The only import surface of @bbc/crm. module.ts implements it; consumers import it. */
export type CrmFacade = {
  findByEmail(emailNormalized: string, opts?: CrmCallOpts): Promise<CrmMatch | null>;
  createActivity(
    input: {
      externalId: string;
      memberId: string;
      offerId: string;
      kind: "interested" | "dismissed";
    },
    opts?: CrmCallOpts,
  ): Promise<{ id: string | null }>;
  submitRequest(payload: unknown, opts?: CrmCallOpts): Promise<CrmSubmitResult>;
};
