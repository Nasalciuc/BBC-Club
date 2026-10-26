/** Match from CRM by normalised email. */
export type CrmMatch = { crmClientId: string; fullName?: string; homeAirport?: string };

export type CrmCallOpts = { signal?: AbortSignal };

export type CrmSubmitResult = { crmRequestId: string };

/** An amount and its currency (`{ amount: 4200, currency: "USD" }`). */
export type CrmMoney = { amount: number; currency: string };

/** A member's request as `send-requests` hands it to the CRM. Every field past the trip and the contact is optional:
 *  an adapter (or an older job) without one still works, and a mail never invents what it was not given. */
export type CrmRequestPayload = {
  reference: string;
  trip_type: string;
  cabin_class: string;
  client: { name: string; phone: string; email: string };
  flights: { from: string; to: string; date: string }[];
  passengers: { adult: number; child: number; infant: number };
  note?: string | null;
  /** The indicative price the member's search showed, recomputed by the server (ADR-IMPL-042). Round trip. `source`:
   *  who priced it (ADR-IMPL-063) — the company's site, or the club's formula; absent, the formula (as before). */
  shown_estimate?: { amount: number; currency: string; cabin: string; source?: "site" | "club" } | null;
  phone_valid?: boolean;
  intent?: "quote" | "alternative" | "fare" | "offer";
  replaces_fare_id?: string | null;
  /** The fare a fare request was made from, and what the request recorded of it when the member asked: the price the
   *  member saw, the fare's published price with its source (ADR-IMPL-046), its airline (ADR-IMPL-056). */
  fare_id?: string | null;
  price_at_request?: CrmMoney | null;
  published_at_request?: { amount: number; source: string } | null;
  carrier?: { code: string | null; name: string } | null;
  /** The offer an offer request was made from, as it reads when the request is sent. */
  offer_id?: string | null;
  offer?: { id: string; title: string; price: CrmMoney } | null;
  /** Which try this is (1 the first). Past the first, the mail may be a second copy of one already delivered: a send
   *  that timed out after the mail service took it is tried again (send-requests). */
  _attempt?: number;
  _source?: string;
  _app_version?: string | null;
  _request_id?: string;
  _actions?: { quoted: string; booked: string; closed: string };
};

/** What a failed CRM call throws (ADR-IMPL-065). `retryable` false: the CRM refused this request as it is (a 4xx other
 *  than 408 and 429, a redirect, a request without its reference) — the same request sent again would be refused again.
 *  Anything else, an error without the field included, is worth trying again. */
export type CrmFailure = Error & { code: string; retryable: boolean };

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
