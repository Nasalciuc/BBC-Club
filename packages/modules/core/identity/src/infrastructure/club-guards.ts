import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/** What the delete sheet says when the password field is empty (the app maps INVALID_PASSWORD to the field). */
export const DELETE_NEEDS_PASSWORD = "Enter your password to delete your account.";

/** The club's own rules on Better Auth's routes. Hooks run for the HTTP router and for in-process `auth.api` calls alike,
 *  in every environment — production and test take the same path. */
export function clubGuards() {
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
      ],
    },
  } satisfies BetterAuthPlugin;
}
