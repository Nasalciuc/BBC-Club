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
  CRM_ADAPTER: z.enum(["mock", "http"]).default("mock"),
  PORT: z.coerce.number().int().positive().default(8000),
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
  return parsed.data;
}
