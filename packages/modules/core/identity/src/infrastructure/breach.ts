import { createHash } from "node:crypto";
import type { ServerEnv } from "@bbc/shared/env";

/** What a member reads when the password they chose is on the breach list (the same words on every path). */
export const BREACHED_PASSWORD_MESSAGE = "This password has appeared in a data breach. Please choose a different one.";
/** The list could not be read: nothing is set, and the member is asked to try again (the check fails closed). */
export const BREACH_CHECK_UNAVAILABLE_MESSAGE = "We couldn't check this password just now. Try again in a moment.";

/** Thrown when the breach list cannot be read. Callers refuse the password; they never let it through unchecked. */
export class BreachCheckUnavailable extends Error {
  constructor(reason: string) {
    super(`breached-password check unavailable: ${reason}`);
    this.name = "BreachCheckUnavailable";
  }
}

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 5_000;

/**
 * Have I Been Pwned's k-anonymity range query, as Better Auth's haveIBeenPwned plugin runs it (SHA-1, the first five hex
 * characters leave the server, Add-Padding), for the paths the plugin never sees: the first password after a code Join
 * (`auth.api.setPassword` is server-only and has no path) and a reset checked before its code is used. Fails closed:
 * an unreachable or failing list throws BreachCheckUnavailable. Padding rows (count 0) never match.
 */
export async function isPasswordBreached(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  let res: Response;
  try {
    res = await fetchImpl(`${RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "BuyBusinessClass Club password check" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new BreachCheckUnavailable(err instanceof Error ? err.name : "fetch failed");
  }
  if (!res.ok) throw new BreachCheckUnavailable(`status ${res.status}`);
  const body = await res.text();
  return body.split("\n").some((line) => {
    const [hash, count] = line.trim().split(":");
    return hash?.toUpperCase() === suffix && Number(count ?? "1") > 0;
  });
}

/**
 * The one breach check every club path uses. A test passes a predicate (IdentityDeps.breachedPassword); NODE_ENV=test
 * without one finds nothing breached and never reaches the network; everything else asks the real list.
 */
export function breachCheck(deps: {
  env: Pick<ServerEnv, "NODE_ENV">;
  breachedPassword?: (password: string) => boolean | Promise<boolean>;
}): (password: string) => Promise<boolean> {
  const predicate = deps.breachedPassword;
  if (predicate) return async (password) => predicate(password);
  if (deps.env.NODE_ENV === "test") return async () => false;
  return (password) => isPasswordBreached(password);
}
