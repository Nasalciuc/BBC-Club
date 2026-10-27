import type { OfferVerdict } from "@bbc/proposals";
import { askWithin, type AskFailure } from "./ask-within";

/** What a request made from an offer may say of it: `ok`, `missing` (no such offer), `not_yours` (one the member never
 *  could see) — or null when it could not be read (an error, a timeout): nothing to check, the request goes on. */
export type OfferCheck = "ok" | "missing" | "not_yours" | null;

/** How long an offer request waits for its offer: one read by key; past this the request goes on. */
export const OFFER_TIMEOUT_MS = 1_000;

/**
 * Whether the member could have seen the offer a request names — proposals' verdict (ADR-IMPL-075), the one the
 * offer's page answers with. Visible now, or gone since and it was for them (everyone's, theirs, their segment's): ok —
 * an offline-queued request must not be lost. For someone else, or not yet published: no. Unknown: no.
 */
export async function askOffer(
  verdict: () => Promise<OfferVerdict>,
  opts: { timeoutMs?: number; unavailable: (reason: AskFailure, err?: unknown) => void },
): Promise<OfferCheck> {
  const answer = await askWithin(
    async (): Promise<Exclude<OfferCheck, null>> => {
      const v = await verdict();
      return v.kind === "visible" || v.kind === "gone" ? "ok" : v.kind;
    },
    opts.timeoutMs ?? OFFER_TIMEOUT_MS,
    opts.unavailable,
  );
  return answer?.value ?? null;
}
