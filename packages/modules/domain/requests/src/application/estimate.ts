import type { EstimateVM } from "@bbc/shared/api/v1/fares";

/** The estimate a quote's search showed, as the catalog answers it: the number and the fingerprint of the rules that
 *  computed it (16 hex — it identifies the rules, it does not reveal them; ADR-IMPL-037). */
export type ShownEstimate = Pick<EstimateVM, "amount" | "currency" | "cabin"> & { rules?: string };

export type EstimateUnavailable = "error" | "timeout" | "invalid";

/** How long a quote waits for its estimate. The reads behind it take milliseconds; past this the request goes on. */
export const ESTIMATE_TIMEOUT_MS = 1_000;

/**
 * Asks for the estimate a quote request carries (ADR-IMPL-042). An estimate decorates a request; it never decides
 * whether one is accepted: an error, an answer slower than `timeoutMs`, or an amount that is not a positive whole
 * number of dollars (the column is an integer) gives no estimate, reported by reason. A read left behind by the timeout
 * finishes on its own; its answer, or its failure, is dropped — the ask is settled into a value first, so nothing it
 * does later can surface as an unhandled rejection.
 */
export async function askEstimate(
  ask: () => Promise<ShownEstimate | null>,
  opts: { timeoutMs?: number; unavailable: (reason: EstimateUnavailable, err?: unknown) => void },
): Promise<ShownEstimate | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ late: true }>((resolve) => {
    timer = setTimeout(() => resolve({ late: true }), opts.timeoutMs ?? ESTIMATE_TIMEOUT_MS);
  });
  try {
    const settled = ask().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    const answer = await Promise.race([settled, late]);
    if ("late" in answer) {
      opts.unavailable("timeout");
      return null;
    }
    if ("error" in answer) {
      opts.unavailable("error", answer.error);
      return null;
    }
    const estimate = answer.value;
    if (estimate && !(Number.isInteger(estimate.amount) && estimate.amount > 0)) {
      opts.unavailable("invalid");
      return null;
    }
    return estimate;
  } catch (err) {
    // `ask` threw before returning a promise.
    opts.unavailable("error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
