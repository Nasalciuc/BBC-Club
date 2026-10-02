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

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = ServerEnv.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${missing}`);
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
    const required = {
      APNS_P8_BASE64: parsed.data.APNS_P8_BASE64,
      APNS_KEY_ID: parsed.data.APNS_KEY_ID,
      APNS_TEAM_ID: parsed.data.APNS_TEAM_ID,
      APNS_BUNDLE_ID: parsed.data.APNS_BUNDLE_ID,
      FCM_SERVICE_ACCOUNT_BASE64: parsed.data.FCM_SERVICE_ACCOUNT_BASE64,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) throw new Error(`PUSH_ADAPTER=live requires ${missing.join(", ")}`);
  }
  if (parsed.data.LOADTEST === "1" && parsed.data.NODE_ENV === "production") {
    throw new Error("LOADTEST=1 is refused in production");
  }
  if (parsed.data.LOADTEST_TRUSTED_PROXIES.trim() && parsed.data.LOADTEST !== "1") {
    throw new Error("LOADTEST_TRUSTED_PROXIES is accepted only with LOADTEST=1");
  }
  return parsed.data;
}
