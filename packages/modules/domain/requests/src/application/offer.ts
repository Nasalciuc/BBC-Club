import { askWithin, type AskFailure } from "./ask-within";

/** The offer as the proposals facade holds it: whom it was for, and whether it is still open. */
export type ProposalOffer = {
  targeting: string;
  targetMemberId: string | null;
  status: string;
  validUntil: Date;
};

/** What a request made from an offer may say of it: `ok`, `missing` (no such offer), `not_yours` (one the member never
 *  could see) — or null when it could not be read (an error, a timeout): nothing to check, the request goes on. */
export type OfferCheck = "ok" | "missing" | "not_yours" | null;

/** How long an offer request waits for its offer: two reads by key; past this the request goes on. */
export const OFFER_TIMEOUT_MS = 1_000;

/**
 * Whether the member could have seen the offer a request names. Visible now: yes. Gone (withdrawn, expired, past its
 * validity): yes when it was broadcast or theirs — an offline-queued request must not be lost — and for a segment's,
 * whose list this module cannot read. Not gone and not visible to them (someone else's, or not yet published): no.
 * Unknown: no.
 */
export async function askOffer(
  q: {
    visible: () => Promise<unknown>;
    any: () => Promise<ProposalOffer | null>;
    memberId: string | null;
    now?: Date;
  },
  opts: { timeoutMs?: number; unavailable: (reason: AskFailure, err?: unknown) => void },
): Promise<OfferCheck> {
  const answer = await askWithin(
    async (): Promise<Exclude<OfferCheck, null>> => {
      if (q.memberId && (await q.visible())) return "ok";
      const offer = await q.any();
      if (!offer) return "missing";
      const lapsed = offer.status === "active" && offer.validUntil.getTime() <= (q.now ?? new Date()).getTime();
      const gone = offer.status === "withdrawn" || offer.status === "expired" || lapsed;
      // Open (or not yet published) and still not visible to this member: it was never theirs to see.
      if (!gone) return "not_yours";
      if (offer.targeting === "user" && offer.targetMemberId !== q.memberId) return "not_yours";
      return "ok";
    },
    opts.timeoutMs ?? OFFER_TIMEOUT_MS,
    opts.unavailable,
  );
  return answer?.value ?? null;
}
