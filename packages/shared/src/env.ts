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
  /** Where the http adapter POSTs each request (ADR-IMPL-065). Required when CRM_ADAPTER=http: https, or http to this
   *  machine (localhost) outside production; in production a public address, never a loopback, private or link-local
   *  one. */
  CRM_API_URL: z.string().url().optional(),
  /** Signs every call to the CRM: HMAC-SHA256, at least 32 characters (ADR-IMPL-065). Required when CRM_ADAPTER=http.
   *  Never sent, never logged. */
  CRM_API_SECRET: z.string().min(32).optional(),
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
  /** Named prepared statements, through PgBouncer too (ADR-IMPL-074). "off" is the switch back without a deploy of code. */
  DB_PREPARE: z.enum(["on", "off"]).default("on"),
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
  "CRM_API_SECRET",
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

/** Loopback only: a CRM on this machine (a test's fake, a local stub). */
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** An IPv4 address as the URL parser writes it (`0x7f.1` and `2130706433` already read `127.0.0.1`), else null. */
function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

/** 0/8 (0.0.0.0 reaches this machine), 10/8, 100.64/10 (carrier NAT), 127/8, 169.254/16 (link-local: a cloud's
 *  metadata service), 172.16/12, 192.168/16. */
function isInternalIpv4([a = 0, b = 0]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** An IPv6 address as the URL parser writes it (lower-case hex groups, `::` once, no dotted quad) as its 8 groups. */
function ipv6Groups(host: string): number[] | null {
  const [head = "", tail, extra] = host.split("::");
  if (extra !== undefined) return null;
  const read = (s: string) =>
    s === "" ? [] : s.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  const front = read(head);
  const back = tail === undefined ? [] : read(tail);
  const zeros = 8 - front.length - back.length;
  if ((tail === undefined ? zeros !== 0 : zeros < 1) || [...front, ...back].some(Number.isNaN)) return null;
  return [...front, ...Array<number>(zeros).fill(0), ...back];
}

/** Unspecified (`::`), loopback (`::1`), unique-local (fc00::/7), link-local (fe80::/10), or an IPv4 address mapped
 *  into IPv6 (`::ffff:a.b.c.d`) that is internal. */
function isInternalIpv6(g: number[]): boolean {
  const [g0 = 0, , , , , g5 = 0, g6 = 0, g7 = 0] = g;
  if (g.slice(0, 7).every((n) => n === 0) && (g7 === 0 || g7 === 1)) return true;
  if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80) return true;
  return g.slice(0, 5).every((n) => n === 0) && g5 === 0xffff && isInternalIpv4([g6 >> 8, g6 & 0xff]);
}

/**
 * Not on the public internet, as written: `localhost` (and `*.localhost`), or an IP literal on this machine, a private
 * network or a link (`isInternalIpv4`, `isInternalIpv6`). A name is not resolved here: one that points inside is the
 * operator's to avoid (ADR-IMPL-065).
 */
function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = ipv4Octets(host);
  if (v4) return isInternalIpv4(v4);
  if (!host.startsWith("[") || !host.endsWith("]")) return false;
  const v6 = ipv6Groups(host.slice(1, -1));
  // A bracketed host the parser wrote is IPv6; one this cannot read is refused rather than trusted.
  return v6 === null || isInternalIpv6(v6);
}

/**
 * CRM_ADAPTER=http (ADR-IMPL-065): the address and the secret, both. The address is https — the requests carry the
 * member's name, phone and e-mail — or http to this machine outside production, for a test's fake CRM. In production it
 * is a public address: never this machine, a private network or a cloud's metadata service, which would receive every
 * member's details. It carries no credentials: the secret signs each call instead, and an address may reach a log.
 */
function httpCrmProblems(env: ServerEnv): string[] {
  const problems: string[] = [];
  const raw = env.CRM_API_URL;
  if (!raw) problems.push("requires CRM_API_URL");
  else {
    const url = new URL(raw);
    const local = url.protocol === "http:" && isLoopbackHost(url.hostname) && env.NODE_ENV !== "production";
    if (url.protocol !== "https:" && !local) {
      problems.push("CRM_API_URL must be https (http only to localhost, outside production)");
    }
    if (env.NODE_ENV === "production" && isInternalHost(url.hostname)) {
      problems.push("CRM_API_URL must be a public address in production (not loopback, private or link-local)");
    }
    if (url.username || url.password) problems.push("CRM_API_URL must not carry credentials (CRM_API_SECRET signs)");
  }
  if (!env.CRM_API_SECRET) problems.push("requires CRM_API_SECRET (at least 32 characters)");
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
    // Here, scripts/check-env.ts names what is missing before a deploy starts anything; integration/crm checks again.
    const problems = httpCrmProblems(parsed.data);
    if (problems.length > 0) throw new Error(`CRM_ADAPTER=http: ${problems.join("; ")}`);
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
