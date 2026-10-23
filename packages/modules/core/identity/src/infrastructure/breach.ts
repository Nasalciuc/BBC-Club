import { createHash } from "node:crypto";
import type { AuthContext, BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { getCurrentAuthContext } from "@better-auth/core/context";
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

/** What Better Auth's haveIBeenPwned plugin (1.6.31) throws, as a 500, when it cannot read the list: "Failed to check
 *  password. Status: …" or "… Please try again later.". It has no code of its own. */
const PLUGIN_CHECK_FAILED = "Failed to check password";

/** The plugin (or its test stand-in) could not read the breach list: the password was neither accepted nor refused. */
export function isBreachListFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { statusCode, body } = err as { statusCode?: unknown; body?: { message?: unknown } };
  return statusCode === 500 && typeof body?.message === "string" && body.message.startsWith(PLUGIN_CHECK_FAILED);
}

/** Better Auth's haveIBeenPwned default paths: the plugin checks a password only while hashing it on one of these. */
const PLUGIN_PATHS = [
  "/sign-up/email",
  "/change-password",
  "/reset-password",
  "/email-otp/reset-password",
  "/phone-number/reset-password",
  "/admin/create-user",
  "/admin/set-user-password",
];

/**
 * Test stand-in for Better Auth's haveIBeenPwned plugin, built the way the plugin is: it wraps `password.hash` and
 * refuses on the plugin's paths only, at hash time — so after a reset's code is used, and never for the path-less
 * `setPassword` — with the plugin's errors (400 PASSWORD_COMPROMISED; a 500 "Failed to check password" when the
 * predicate throws, as for an unreachable list). Tests then meet what production meets.
 */
export function breachListStandIn(isBreached: (password: string) => Promise<boolean>) {
  return {
    id: "test-hibp",
    init(ctx: AuthContext) {
      const originalHash = ctx.password.hash;
      return {
        context: {
          password: {
            ...ctx.password,
            async hash(password: string) {
              const c = await getCurrentAuthContext();
              if (!c.path || !PLUGIN_PATHS.includes(c.path)) return originalHash(password);
              let breached: boolean;
              try {
                breached = await isBreached(password);
              } catch {
                // As the plugin does when the list cannot be read.
                throw new APIError("INTERNAL_SERVER_ERROR", {
                  message: `${PLUGIN_CHECK_FAILED}. Please try again later.`,
                });
              }
              if (breached) {
                throw APIError.from("BAD_REQUEST", {
                  code: "PASSWORD_COMPROMISED",
                  message: BREACHED_PASSWORD_MESSAGE,
                });
              }
              return originalHash(password);
            },
          },
        },
      };
    },
  } satisfies BetterAuthPlugin;
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
