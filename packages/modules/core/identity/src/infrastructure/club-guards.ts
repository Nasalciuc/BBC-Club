import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { BREACH_CHECK_UNAVAILABLE_MESSAGE, BREACHED_PASSWORD_MESSAGE } from "./breach";

/** What the delete sheet says when the password field is empty (the app maps INVALID_PASSWORD to the field). */
export const DELETE_NEEDS_PASSWORD = "Enter your password to delete your account.";

/** "At least one number or symbol" — the app's rule (apps/mobile/src/features/auth/schemas.ts). Defined here until the
 *  shared PASSWORD_RULE (packages/shared/src/api/v1/proposals.ts) lands; then import that one, so there is one rule. */
export const PASSWORD_RULE = /[\d\W]/;
export const PASSWORD_TOO_WEAK_MESSAGE = "Use at least one number or symbol.";

export type ClubGuardDeps = {
  /** breach.ts breachCheck(): the list, or the test predicate. Throws when the list cannot be read. */
  isBreached: (password: string) => Promise<boolean>;
};

/** The club's own rules on Better Auth's routes. Hooks run for the HTTP router and for in-process `auth.api` calls alike,
 *  in every environment — production and test take the same path. */
export function clubGuards({ isBreached }: ClubGuardDeps) {
  return {
    id: "club-guards",
    hooks: {
      before: [
        {
          // Better Auth 1.6.31 checks the password on /delete-user only `if (ctx.body.password)`: an empty or missing one
          // skips the check, and then only the session's age (a day) stands between a phone left unlocked and a deleted
          // account. The club asks for the password every time. INVALID_PASSWORD on purpose: installed builds already turn
          // it into the field's error, never into "deleted". Do not set session.freshAge to 0 instead: in this version the
          // age check is `if (!ctx.body.password && freshAge !== 0)`, so 0 removes the last guard. No delete-by-email token
          // is configured (sendDeleteAccountVerification), so `body.token` does not stand in for the password either.
          matcher: (ctx: { path?: string }) => ctx.path === "/delete-user",
          handler: createAuthMiddleware(async (ctx) => {
            const password = (ctx.body as { password?: unknown } | undefined)?.password;
            if (typeof password !== "string" || password.trim() === "") {
              throw APIError.from("BAD_REQUEST", { code: "INVALID_PASSWORD", message: DELETE_NEEDS_PASSWORD });
            }
          }),
        },
        {
          // A reset by code uses the code up (atomicVerifyOTP) before it hashes the new password, where Better Auth's
          // haveIBeenPwned refuses a breached one: the member's next try, with a good password, met "Invalid OTP". The
          // club's rules run here, before the route, so a refused password leaves the code as it was. The plugin stays
          // as the backstop. The app's number-or-symbol rule is enforced here too (the route only knows the length).
          matcher: (ctx: { path?: string }) => ctx.path === "/email-otp/reset-password",
          handler: createAuthMiddleware(async (ctx) => {
            const password = (ctx.body as { password?: unknown } | undefined)?.password;
            if (typeof password !== "string") return; // the route's own schema answers
            const { minPasswordLength, maxPasswordLength } = ctx.context.password.config;
            // Too short or too long: the route says so itself, before it touches the code.
            if (password.length < minPasswordLength || password.length > maxPasswordLength) return;
            if (!PASSWORD_RULE.test(password)) {
              throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_WEAK", message: PASSWORD_TOO_WEAK_MESSAGE });
            }
            let breached: boolean;
            try {
              breached = await isBreached(password);
            } catch {
              // Fails closed, and before the code is used: the member tries again with the same code.
              throw APIError.from("SERVICE_UNAVAILABLE", {
                code: "PASSWORD_CHECK_UNAVAILABLE",
                message: BREACH_CHECK_UNAVAILABLE_MESSAGE,
              });
            }
            if (breached) {
              throw APIError.from("BAD_REQUEST", { code: "PASSWORD_COMPROMISED", message: BREACHED_PASSWORD_MESSAGE });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
