import { z } from "zod";

/** The only place EXPO_PUBLIC_* is read. Missing or malformed values fail at startup, not on the first request. */
const Schema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  /** `e2e`: the emulator build of .github/workflows/e2e-android.yml (cleartext to 10.0.2.2 only). */
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "staging", "production", "e2e"]).default("development"),
  /** E.164 support line; empty → Call support / specialist dial is disabled. */
  EXPO_PUBLIC_SUPPORT_PHONE: z.string().min(1).optional(),
  EXPO_PUBLIC_PRIVACY_URL: z.string().url().optional(),
  EXPO_PUBLIC_TERMS_URL: z.string().url().optional(),
  EXPO_PUBLIC_HELP_URL: z.string().url().optional(),
  /** Mapbox public token. Absent → the drawn globe (GlobeFallback). A secret `sk.` token must never reach the app. */
  EXPO_PUBLIC_MAPBOX_TOKEN: z
    .string()
    .startsWith("pk.", "must be a public Mapbox token (pk.…), never a secret one")
    .optional(),
});

const parsed = Schema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPPORT_PHONE: process.env.EXPO_PUBLIC_SUPPORT_PHONE || undefined,
  EXPO_PUBLIC_PRIVACY_URL: process.env.EXPO_PUBLIC_PRIVACY_URL || undefined,
  EXPO_PUBLIC_TERMS_URL: process.env.EXPO_PUBLIC_TERMS_URL || undefined,
  EXPO_PUBLIC_HELP_URL: process.env.EXPO_PUBLIC_HELP_URL || undefined,
  EXPO_PUBLIC_MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || undefined,
});

if (!parsed.success) {
  throw new Error(
    `Invalid EXPO_PUBLIC_* environment:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
  );
}

export const env = parsed.data;
