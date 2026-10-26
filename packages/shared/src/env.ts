import { z } from "zod";

/** Fail fast at boot. Never `process.env.X as string`. */
export const ServerEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().url(), // https://api.buybusinessclass.club
  MOBILE_SCHEME: z.string().default("bbcclub"),
  /**
   * Extra browser origins for /api/auth CORS and Better Auth trustedOrigins.
   * Comma-separated. Empty in production except a public https origin (operator later).
   * Local Metro / LAN IPs belong here, never in source.
   */
  CORS_ORIGINS: z.string().default(""),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  POSTMARK_SERVER_TOKEN: z.string().min(10).optional(), // optional in dev: emails are logged
  POSTMARK_FROM: z.string().email().default("club@buybusinessclass.com"),
  REVIEW_ACCOUNT_EMAIL: z.string().email().optional(),
  REVIEW_ACCOUNT_PASSWORD: z.string().min(12).optional(),
  INTERNAL_API_SECRET: z.string().min(32),
  /** Dual-secret rotation window — accepted alongside INTERNAL_API_SECRET when set. */
  INTERNAL_API_SECRET_NEXT: z.string().min(32).optional(),
  CRM_ADAPTER: z.enum(["mock", "http", "email"]).default("mock"),
  /** Inbox for the email CRM adapter. Required when CRM_ADAPTER=email. */
  OPERATORS_EMAIL: z.string().email().optional(),
  /** HMAC for operator action links. Required when CRM_ADAPTER=email. */
  OPS_LINK_SECRET: z.string().min(32).optional(),
  PUSH_ADAPTER: z.enum(["recording", "live"]).default("recording"),
  APNS_P8_BASE64: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  FCM_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8000),
  /** "all" = today's process (tests and local). Deployed: API serves members; worker owns poller and jobs. */
  APP_ROLE: z.enum(["all", "api", "worker"]).default("all"),
  WORKER_PORT: z.coerce.number().int().positive().default(8001),
  /** "transaction" when DATABASE_URL is PgBouncer in transaction pooling. Worker/migrate/seeds stay "none". */
  DB_POOLER: z.enum(["none", "transaction"]).default("none"),
  SESSION_COOKIE_CACHE_SECONDS: z.coerce.number().int().min(10).max(300).default(60),
  /** Only with LOADTEST=1. Comma-separated CIDRs/IPs treated as trusted proxies for X-Forwarded-For. */
  LOADTEST: z.enum(["0", "1"]).optional(),
  LOADTEST_TRUSTED_PROXIES: z.string().default(""),
  /** Optional. Worker uses this for SHOW POOLS (PgBouncer admin database). */
  PGBOUNCER_ADMIN_URL: z.string().url().optional(),
  /**
   * Slack-compatible incoming webhook. Worker db-observe POSTs when pool_waiting > 0
   * for 2 minutes or oldest_tx > 30s. Empty in env files is unset.
   */
  OPS_WEBHOOK: z.union([z.string().url(), z.literal("")]).optional(),
  /** Optional. Unset: every path stays on Postgres / process memory (ADR-IMPL-029). */
  REDIS_URL: z.union([z.string().url(), z.literal("")]).optional(),
  /** Optional comma-separated host:port list. Unset: the Kafka relay is not registered (ADR-IMPL-030). */
  KAFKA_BROKERS: z.string().optional(),
  /** Optional. Place photos from Pexels where Commons has none (ADR-IMPL-043). Unset: Commons, then satellite. */
  PEXELS_API_KEY: z.string().min(20).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Loopback, RFC1918, or non-https — not a public operator origin. */
export function isInsecureOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  if (url.protocol !== "https:") return true;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

/** One list: CORS allowlist and Better Auth trustedOrigins. */
export function authOrigins(env: ServerEnv): string[] {
  return [env.APP_ORIGIN, `${env.MOBILE_SCHEME}://`, ...parseCorsOrigins(env.CORS_ORIGINS)];
}

/**
 * An empty value means unset where the schema rejects "" — `REVIEW_ACCOUNT_EMAIL=` in an env file must not fail the
 * email check and stop the server; an empty `CRM_ADAPTER=` takes its default. Where the schema itself accepts ""
 * (`OPS_WEBHOOK`, `CORS_ORIGINS`), the empty value is kept exactly as written. Read from the schema, not from a list.
 */
export function withoutRejectedEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const shape = ServerEnv.shape as Record<string, z.ZodTypeAny>;
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => value !== "" || !shape[key] || shape[key].safeParse("").success),
  );
}

/**
 * `KEY=   # hint` in an env file gives KEY the value "# hint": Compose keeps a comment that follows an empty value. Such a
 * value is the example file's text, not a setting.
 */
export function isTemplateComment(value: string | undefined): boolean {
  return value !== undefined && /^#\s/.test(value);
}

/** Keys that sign or unlock something: holding the example's comment, each would be text anyone can read in this repo. */
const SECRETS = [
  "BETTER_AUTH_SECRET",
  "INTERNAL_API_SECRET",
  "INTERNAL_API_SECRET_NEXT",
  "OPS_LINK_SECRET",
  "REVIEW_ACCOUNT_PASSWORD",
] as const;

/** True when `b64` decodes to text that passes `check`. The decoded text never leaves this function. */
function decodesTo(b64: string, check: (text: string) => boolean): boolean {
  try {
    return check(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return false;
  }
}

function isServiceAccount(text: string): boolean {
  const account = JSON.parse(text) as Record<string, unknown> | null;
  const field = (name: string) => account?.[name];
  return (
    ["project_id", "client_email", "private_key"].every(
      (name) => typeof field(name) === "string" && field(name) !== "",
    ) && String(field("private_key")).includes("PRIVATE KEY")
  );
}

/**
 * PUSH_ADAPTER=live: Android through FCM always; iPhone through APNs once the Apple account exists (N1), with all of its
 * keys or none. APNS_BUNDLE_ID alone does not count: the example env fills it in. Without APNs, an iPhone push is marked
 * failed and the token stays for later (integration/push).
 */
function livePushProblems(env: ServerEnv): string[] {
  const problems: string[] = [];
  const fcm = env.FCM_SERVICE_ACCOUNT_BASE64;
  if (!fcm) problems.push("requires FCM_SERVICE_ACCOUNT_BASE64 (Android)");
  else if (!decodesTo(fcm, isServiceAccount)) {
    problems.push(
      "FCM_SERVICE_ACCOUNT_BASE64 is not base64 of a Firebase service-account JSON (project_id, client_email, private_key)",
    );
  }
  const p8 = env.APNS_P8_BASE64;
  const apns = { APNS_P8_BASE64: p8, APNS_KEY_ID: env.APNS_KEY_ID, APNS_TEAM_ID: env.APNS_TEAM_ID };
  if (Object.values(apns).some(Boolean)) {
    const missing = Object.entries({ ...apns, APNS_BUNDLE_ID: env.APNS_BUNDLE_ID })
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      problems.push(
        `iPhone push needs every APNs key, or none of APNS_P8_BASE64, APNS_KEY_ID, APNS_TEAM_ID: missing ${missing.join(", ")}`,
      );
    } else if (p8 && !decodesTo(p8, (text) => text.includes("PRIVATE KEY"))) {
      problems.push("APNS_P8_BASE64 is not base64 of the .p8 key from Apple Developer → Keys");
    }
  }
  return problems;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const comments = SECRETS.filter((key) => isTemplateComment(source[key]));
  if (comments.length > 0) {
    throw new Error(
      `${comments.join(", ")}: the example file's comment, not a secret ("KEY=   # …" keeps the comment as the value) — write the secret on that line`,
    );
  }
  const parsed = ServerEnv.safeParse(withoutRejectedEmptyValues(source));
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${missing}`);
  }
  if (parsed.data.CRM_ADAPTER === "http") {
    // integration/crm refuses it as well; here, scripts/check-env.ts names it before a deploy starts anything.
    throw new Error("CRM_ADAPTER=http is not built yet (stage 5): use email or mock");
  }
  if (parsed.data.CRM_ADAPTER === "email") {
    if (!parsed.data.OPERATORS_EMAIL) {
      throw new Error("OPERATORS_EMAIL is required when CRM_ADAPTER=email");
    }
    if (!parsed.data.OPS_LINK_SECRET) {
      throw new Error("OPS_LINK_SECRET is required when CRM_ADAPTER=email");
    }
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.POSTMARK_SERVER_TOKEN) {
    throw new Error("POSTMARK_SERVER_TOKEN is required in production (OTP delivery = login availability).");
  }
  if (parsed.data.NODE_ENV === "production") {
    for (const origin of parseCorsOrigins(parsed.data.CORS_ORIGINS)) {
      if (isInsecureOrigin(origin)) {
        throw new Error(`CORS_ORIGINS must not include an insecure origin in production: ${origin}`);
      }
    }
  }
  if (parsed.data.PUSH_ADAPTER === "live") {
    const problems = livePushProblems(parsed.data);
    if (problems.length > 0) throw new Error(`PUSH_ADAPTER=live: ${problems.join("; ")}`);
  }
  if (parsed.data.LOADTEST === "1" && parsed.data.NODE_ENV === "production") {
    throw new Error("LOADTEST=1 is refused in production");
  }
  if (parsed.data.LOADTEST_TRUSTED_PROXIES.trim() && parsed.data.LOADTEST !== "1") {
    throw new Error("LOADTEST_TRUSTED_PROXIES is accepted only with LOADTEST=1");
  }
  return parsed.data;
}
