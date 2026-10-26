/** Why a question that decorates a request went unanswered. */
export type AskFailure = "error" | "timeout";

/**
 * Asks the catalog a question a request is decorated with — the estimate a quote's search showed (ADR-IMPL-042), the
 * fare's published price and airline (ADR-IMPL-046, ADR-IMPL-056) — and waits at most `timeoutMs`. An answer comes back
 * as `{ value }`; an error or a slower answer as null, reported by reason. A read left behind by the timeout finishes
 * on its own; its answer, or its failure, is dropped — the ask is settled into a value first, so nothing it does later
 * can surface as an unhandled rejection.
 */
export async function askWithin<T>(
  ask: () => Promise<T>,
  timeoutMs: number,
  unavailable: (reason: AskFailure, err?: unknown) => void,
): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ late: true }>((resolve) => {
    timer = setTimeout(() => resolve({ late: true }), timeoutMs);
  });
  try {
    const settled = ask().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    const answer = await Promise.race([settled, late]);
    if ("late" in answer) {
      unavailable("timeout");
      return null;
    }
    if ("error" in answer) {
      unavailable("error", answer.error);
      return null;
    }
    return answer;
  } catch (err) {
    // `ask` threw before returning a promise.
    unavailable("error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
