import { CLOUDFLARE_RANGES } from "@bbc/shared/net/cloudflare-ranges";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, haveIBeenPwned, jwt, bearer, admin } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { authOrigins, type ServerEnv } from "@bbc/shared/env";
import { event } from "@bbc/shared/events";
import type { EmailSender } from "../ports/email";
import type { EventPublisher } from "../ports/events";
import type { Executor } from "@bbc/db";
import { ac, roles } from "./access";
import { claimOtpSend, releaseOtpClaim } from "./otp-cooldown";
import { classifyOtpSendError, recordOtpSendFailure, type OtpSendFailure } from "./otp-send-outcome";
import { opsWebhook, otpFailureAlert } from "./ops-alert";
import { clubGuards } from "./club-guards";
import { BREACHED_PASSWORD_MESSAGE, breachCheck, breachListStandIn } from "./breach";
import * as authSchema from "./schema"; // generated: `npx @better-auth/cli generate` → auth.* tables (pgSchema "auth")

export type Logger = {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
};
export type IdentityDeps = {
  env: ServerEnv;
  db: Executor;
  email: EmailSender;
  events: EventPublisher;
  logger: Logger;
  /** Counters on /metrics (platform.metrics): otp_sent{purpose}, otp_send_failed{purpose,reason}. */
  metrics?: Metrics;
  /** One line to the ops channel. Default: POST to OPS_WEBHOOK (ops-alert.ts); tests record instead. */
  notifyOps?: (text: string) => Promise<void>;
  /** Test-only: replace the real HIBP plugin (and the club's own checks, breach.ts) with a predicate. Production never
   *  passes this. */
  breachedPassword?: (password: string) => boolean | Promise<boolean>;
};
export type Metrics = { inc(name: string, labels?: Record<string, string>, by?: number): void };

const TEN_MINUTES = 60 * 10;
/** OTP lifetime and send window — one live code per IP; aligned with verify UI countdown. */
const FIFTEEN_MINUTES = 60 * 15;

/** What the send callback rethrows: the failure's facts only. Postmark's own message can name the recipient, and Better
 *  Auth prints whatever reaches runInBackgroundOrAwait to the console. */
class OtpSendFailed extends Error {
  constructor(failure: OtpSendFailure) {
    super(`otp send failed: ${failure.reason}${failure.status !== undefined ? ` (status ${failure.status})` : ""}`);
    this.name = "OtpSendFailed";
  }
}

export function createAuth({ env, db, email, events, logger, metrics, notifyOps, breachedPassword }: IdentityDeps) {
  const isProd = env.NODE_ENV === "production";
  const isBreached = breachCheck({ env, breachedPassword });
  const alertOtpFailure = otpFailureAlert({ post: notifyOps ?? opsWebhook(env, logger), logger });

  return betterAuth({
    appName: "BuyBusinessClass Club",
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),

    // Mobile scheme + APP_ORIGIN + CORS_ORIGINS extras — same list as host CORS.
    trustedOrigins: authOrigins(env),

    // A signed-in member changes the password through POST /v1/account/password only, limited per member (ADR-IMPL-047).
    // Better Auth's own routes that check it, which the app never calls, would let a session guess it: /change-password
    // three times every ten seconds from each address, /verify-password sixty a minute. Only the HTTP router reads this
    // list: the club's route still calls auth.api.changePassword in-process. /delete-user stays (the app deletes there;
    // customRules; club-guards asks for the password every time).
    // /sign-up/email: Join is OTP-first (ADR-PROD-001 path A) and the app never calls it. Served, it answered an
    // existing address with a synthetic user whose role was null and a new one with role "member" (an account oracle),
    // mailed a code to whatever address it was given, and left an unverified account in the owner's way. In-process
    // auth.api.signUpEmail (seed scripts, tests, load bench) is unaffected.
    // /expo-authorization-proxy (mounted by expo()) redirects to every https URL but the API's own origin: an open redirect
    // on the club's domain, for a social login the club does not have (MODULE.md). expo() stays for the app's cookies. If
    // social login ever ships, allow-list the providers' authorization hosts instead of serving it as it is.
    disabledPaths: ["/change-password", "/verify-password", "/sign-up/email", "/expo-authorization-proxy"],

    emailAndPassword: {
      enabled: true,
      // The number-or-symbol rule: the app's schema for every path, club-guards for a reset by code (before its code is
      // used). A change or first set through POST /v1/account/password relies on the app until PasswordBody carries it.
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: true, // no session until the code is verified
      autoSignIn: false,
      // Reset is code-based via the emailOTP plugin (no link-based sendResetPassword).
      // A reset signs out every session the account had (the plugin's reset reads this flag too): a password reset
      // because another phone knew the old one must not leave that phone signed in for 30 days (ADR-IMPL-047). The app
      // signs in again with the new password right after (features/auth/flows.ts, resetPassword).
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true }, // code verified → straight into the club

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // rolling refresh once per day
      cookieCache: { enabled: true, maxAge: env.SESSION_COOKIE_CACHE_SECONDS },
    },

    rateLimit: {
      enabled: true,
      storage: "database", // Postgres (auth.rateLimit) — no Redis on a security path
      window: 60,
      max: 60, // default for everything not listed
      customRules: {
        "/sign-in/email": { window: TEN_MINUTES, max: 5 },
        // Final per-IP limit for OTP send (plugin rateLimit is applied first, then this overwrites —
        // see better-auth rate-limiter resolveRateLimitConfig). Keep emailOTP({ rateLimit }) in sync.
        "/email-otp/send-verification-otp": { window: FIFTEEN_MINUTES, max: 10 },
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
          // Runs after Better Auth's insert, outside its transaction → members reconciles every 15 min (MODULE.md).
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
      // Caddy forwards `client, cloudflare`. Without trustedProxies Better Auth resolves no IP from a two-value
      // X-Forwarded-For and rate-limits every member in ONE bucket (core/utils/ip getIPFromHeader).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: [...CLOUDFLARE_RANGES] },
    },

    plugins: [
      expo(),
      clubGuards({ isBreached }),
      emailOTP({
        otpLength: 6,
        expiresIn: FIFTEEN_MINUTES,
        allowedAttempts: 5,
        // Same digits on a permitted second send (other IP / cleared rate_limit); 429 stops the mail.
        resendStrategy: "reuse",
        // Recoverable (reuse works) and not plaintext in auth.verification — "hashed" is unkeyed SHA-256
        // of six digits (~20 bits) and forces rotate.
        storeOTP: "encrypted",
        sendVerificationOnSignUp: true,
        // Plugin default is 3/60s for every emailOTP path. customRules overwrites per path after;
        // set this to the send window so an accidental customRules removal still allows colleagues.
        rateLimit: { window: FIFTEEN_MINUTES, max: 10 },
        // Recipient = the user's email; send is awaited inside our callback. Better Auth 1.6.31's
        // runInBackgroundOrAwait swallows what this throws and the route answers 200: a failure releases the claim (a
        // retry inside the 30 s window mails again) and is recorded for the request, so club-guards answers a sign-in
        // send 503 EMAIL_UNDELIVERABLE. A reset or verification code keeps its constant 200 (anti-enumeration).
        sendVerificationOTP: async ({ email: to, otp, type }) => {
          // Same answer either way (no enumeration). resendStrategy "reuse" keeps the earlier code valid.
          // BA resolveOTP may have already stored a *replacement* OTP before this runs — claim by otp HMAC
          // so a new code still mails inside the 30s UI window. No claim: the code mailed moments ago is still valid,
          // and the answer stays a silent 200.
          const claim = await claimOtpSend(db, to, type, otp, env.BETTER_AUTH_SECRET);
          if (!claim) {
            logger.info({ type }, "otp: resend inside cooldown, not sent"); // never log the address
            return;
          }
          try {
            await email.sendOtp({ to, otp, purpose: type });
          } catch (e) {
            const failure = classifyOtpSendError(e);
            // The facts only: never the address, never the code, never the provider's message (it can name the address).
            logger.error(
              {
                purpose: type,
                reason: failure.reason,
                status: failure.status,
                postmarkErrorCode: failure.postmarkErrorCode,
              },
              "otp send failed",
            );
            metrics?.inc("otp_send_failed", { purpose: type, reason: failure.reason });
            try {
              await releaseOtpClaim(db, claim);
            } finally {
              await recordOtpSendFailure(failure);
            }
            await alertOtpFailure(type, failure);
            throw new OtpSendFailed(failure);
          }
          metrics?.inc("otp_sent", { purpose: type });
          logger.info({ to: mask(to), purpose: type }, "otp sent");
        },
      }),
      // Tests: a stand-in that refuses exactly as the plugin does (same paths, at hash time, PASSWORD_COMPROMISED), with a
      // predicate instead of the network.
      env.NODE_ENV === "test" || breachedPassword !== undefined
        ? breachListStandIn(isBreached)
        : haveIBeenPwned({ customPasswordCompromisedMessage: BREACHED_PASSWORD_MESSAGE }),
      jwt({ jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } }, disableSettingJwtHeader: true }), // operator/system callers only
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
