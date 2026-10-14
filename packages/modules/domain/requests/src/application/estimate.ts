import type { EstimateVM } from "@bbc/shared/api/v1/fares";
import { askWithin, type AskFailure } from "./ask-within";

/** The estimate a quote's search showed, as the catalog answers it: the number and the fingerprint of the rules that
 *  computed it (16 hex — it identifies the rules, it does not reveal them; ADR-IMPL-037). */
export type ShownEstimate = Pick<EstimateVM, "amount" | "currency" | "cabin"> & { rules?: string };

export type EstimateUnavailable = AskFailure | "invalid";

/** How long a quote waits for its estimate. The reads behind it take milliseconds; past this the request goes on. */
export const ESTIMATE_TIMEOUT_MS = 1_000;

/**
 * Asks for the estimate a quote request carries (ADR-IMPL-042). An estimate decorates a request; it never decides
 * whether one is accepted: an error, an answer slower than `timeoutMs`, or an amount that is not a positive whole
 * number of dollars (the column is an integer) gives no estimate, reported by reason. A read left behind by the timeout
 * finishes on its own; its answer, or its failure, is dropped (askWithin).
 */
export async function askEstimate(
  ask: () => Promise<ShownEstimate | null>,
  opts: { timeoutMs?: number; unavailable: (reason: EstimateUnavailable, err?: unknown) => void },
): Promise<ShownEstimate | null> {
  const answer = await askWithin(ask, opts.timeoutMs ?? ESTIMATE_TIMEOUT_MS, opts.unavailable);
  const estimate = answer?.value ?? null;
  if (estimate && !(Number.isInteger(estimate.amount) && estimate.amount > 0)) {
    opts.unavailable("invalid");
    return null;
  }
  return estimate;
}
