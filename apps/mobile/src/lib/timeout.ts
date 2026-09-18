/** Shared 10s budget for apiFetch and Better Auth. RN 0.86.3 polyfills AbortSignal from
 *  `abort-controller`, which has no `.timeout` — Hermes on Android takes the AbortController path. */

export const API_TIMEOUT_MS = 10_000;

export class NetworkError extends Error {
  constructor(readonly code: "TIMEOUT" | "OFFLINE") {
    super(code);
    this.name = "NetworkError";
  }
}

export function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    try {
      return { signal: AbortSignal.timeout(ms), cancel: () => {} };
    } catch {
      // typed as present on some RN versions, missing or throwing at runtime
    }
  }
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

export async function withAuthTimeout<T>(p: Promise<T>, ms: number = API_TIMEOUT_MS): Promise<T> {
  const own = timeoutSignal(ms);
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        const fail = () => reject(new NetworkError("TIMEOUT"));
        if (own.signal.aborted) {
          fail();
          return;
        }
        own.signal.addEventListener("abort", fail, { once: true });
      }),
    ]);
  } finally {
    own.cancel();
  }
}

export function networkFail(e: unknown): { ok: false; message: string; code: "TIMEOUT" | "OFFLINE"; status: number } {
  const code =
    e instanceof NetworkError ? e.code : e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : "OFFLINE";
  const timeout = code === "TIMEOUT";
  return {
    ok: false,
    status: 0,
    code,
    message: timeout
      ? "Taking longer than usual — check your connection"
      : "You're offline. We'll send this when you're back.",
  };
}
