import { z } from "zod";

/** Fail fast at boot. Never `process.env.X as string`. */
export const ServerEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().url(),                       // https://api.buybusinessclass.club
  MOBILE_SCHEME: z.string().default("bbcclub"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  POSTMARK_SERVER_TOKEN: z.string().min(10).optional(),   // optional in dev: emails are logged
  POSTMARK_FROM: z.string().email().default("club@buybusinessclass.com"),
  REVIEW_ACCOUNT_EMAIL: z.string().email().optional(),
  REVIEW_ACCOUNT_PASSWORD: z.string().min(12).optional(),
  INTERNAL_API_SECRET: z.string().min(32),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = ServerEnv.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${missing}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.POSTMARK_SERVER_TOKEN) {
    throw new Error("POSTMARK_SERVER_TOKEN is required in production (OTP delivery = login availability).");
  }
  return parsed.data;
}
