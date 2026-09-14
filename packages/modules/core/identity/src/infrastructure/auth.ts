import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, haveIBeenPwned, jwt, bearer, admin } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import type { ServerEnv } from "@bbc/shared/env";
import { event } from "@bbc/shared/events";
import type { EmailSender } from "../ports/email";
import type { EventPublisher } from "../ports/events";
import { ac, roles } from "./access";
import * as authSchema from "./schema"; // generated: `npx @better-auth/cli generate` → auth.* tables (pgSchema "auth")

export type Logger = {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
};
export type IdentityDeps = {
  env: ServerEnv;
  db: any;
  email: EmailSender;
  events: EventPublisher;
  logger: Logger;
  /** Test-only: replace the real HIBP plugin with a predicate. Production never passes this. */
  breachedPassword?: (password: string) => boolean | Promise<boolean>;
};

const TEN_MINUTES = 60 * 10;

export function createAuth({ env, db, email, events, logger, breachedPassword }: IdentityDeps) {
  const isProd = env.NODE_ENV === "production";

  return betterAuth({
    appName: "BuyBusinessClass Club",
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),

    // Mobile presents the custom scheme as origin (Expo plugin); the operator web app (later) its https origin.
    trustedOrigins: [`${env.MOBILE_SCHEME}://`, env.APP_ORIGIN],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8, // number/symbol rule is enforced by the shared Zod schema; breach check below
      maxPasswordLength: 128,
      requireEmailVerification: true, // no session until the code is verified
      autoSignIn: false,
      // Reset is code-based via the emailOTP plugin (no link-based sendResetPassword).
    },
    emailVerification: { autoSignInAfterVerification: true }, // code verified → straight into the club

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // rolling refresh once per day
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    rateLimit: {
      enabled: true,
      storage: "database", // Postgres (auth.rateLimit) — no Redis on a security path
      window: 60,
      max: 60, // default for everything not listed
      customRules: {
        "/sign-in/email": { window: TEN_MINUTES, max: 5 },
        "/sign-up/email": { window: TEN_MINUTES, max: 5 },
        "/email-otp/send-verification-otp": { window: TEN_MINUTES, max: 3 },
        "/email-otp/verify-email": { window: TEN_MINUTES, max: 10 },
        "/email-otp/reset-password": { window: 60 * 15, max: 5 },
        "/forget-password/email-otp": { window: 60 * 15, max: 3 },
        "/delete-user": { window: 60 * 60, max: 3 },
      },
    },

    user: {
      deleteUser: {
        enabled: true, // Apple 5.1.1(v); our tables are cascaded by handlers of member.deleted
        beforeDelete: async (user) => {
          await events.publish({
            type: "member.deleted",
            version: 1,
            aggregateType: "member",
            aggregateId: user.id,
            memberId: user.id,
            payload: event("member.deleted", { memberId: user.id, deletedAt: new Date().toISOString() }),
          });
        },
        afterDelete: async (user) => logger.info({ memberId: user.id }, "member deleted"),
      },
    },

    databaseHooks: {
      user: {
        create: {
          // Runs after Better Auth's insert, outside its transaction → members reconciles nightly (MODULE.md).
          after: async (user) => {
            await events.publish({
              type: "member.registered",
              version: 1,
              aggregateType: "member",
              aggregateId: user.id,
              memberId: user.id,
              payload: event("member.registered", {
                memberId: user.id,
                emailNormalized: user.email.trim().toLowerCase(),
                registeredAt: new Date().toISOString(),
              }),
            });
          },
        },
      },
    },

    advanced: {
      useSecureCookies: isProd,
      cookiePrefix: "bbc",
      // Better Auth 1.6.31: "uuid" means "the database generates it", but auth.user.id is text with no default
      // (the CLI-generated schema, kept regen-safe). Generate in-app instead — a real UUID, no schema edit.
      database: { generateId: () => crypto.randomUUID() },
    },

    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: TEN_MINUTES,
        allowedAttempts: 5,
        sendVerificationOnSignUp: true,
        // The tutorial's fatal bug made impossible: recipient = the user's email, the call is awaited,
        // and a provider failure propagates → Better Auth returns an error → the app shows it.
        sendVerificationOTP: async ({ email: to, otp, type }) => {
          await email.sendOtp({ to, otp, purpose: type });
          logger.info({ to: mask(to), purpose: type }, "otp sent");
        },
      }),
      ...(env.NODE_ENV === "test" || breachedPassword !== undefined
        ? [
            {
              id: "test-hibp",
              hooks: {
                before: [
                  {
                    matcher: (ctx: { path?: string }) =>
                      typeof ctx.path === "string" &&
                      (ctx.path.includes("sign-up") || ctx.path.includes("change-password")),
                    handler: async (ctx: { body?: { password?: string } }) => {
                      const check = breachedPassword ?? (() => false);
                      const password = ctx.body?.password;
                      if (password && (await check(password))) {
                        const { APIError } = await import("better-auth/api");
                        throw new APIError("BAD_REQUEST", {
                          message: "This password has appeared in a data breach. Please choose a different one.",
                        });
                      }
                    },
                  },
                ],
              },
            },
          ]
        : [
            haveIBeenPwned({
              customPasswordCompromisedMessage:
                "This password has appeared in a data breach. Please choose a different one.",
            }),
          ]),
      jwt({ jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } } }), // operator/system callers only
      bearer(),
      admin({ ac, roles, defaultRole: "member", adminRoles: ["operator", "system"] }),
    ],
  });
}
export type Auth = ReturnType<typeof createAuth>;

function mask(email: string) {
  const [u, d] = email.split("@");
  return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`;
}
