import { z } from "zod";

/** The only place EXPO_PUBLIC_* is read. Missing or malformed values fail at startup, not on the first request. */
const Schema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

const parsed = Schema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
});

if (!parsed.success) {
  throw new Error(
    `Invalid EXPO_PUBLIC_* environment:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
  );
}

export const env = parsed.data;
