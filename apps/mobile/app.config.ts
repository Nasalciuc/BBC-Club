import type { ConfigContext, ExpoConfig } from "expo/config";

/** app.json stays the source of truth. Every build resolves to exactly app.json — production included —
 *  except the e2e APK (EXPO_PUBLIC_APP_ENV=e2e, built by .github/workflows/e2e-android.yml), which may speak
 *  cleartext to the emulator host and runs the bundle it was built with, never an OTA update, and a build given
 *  Firebase's file for Android push (withFirebase). */

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Whether the app can dial `phone`: `telHref`'s rule (src/lib/support-phone-logic.ts), repeated because Expo reads
 *  this file on its own and cannot require the app's TypeScript ("Cannot find module"). app.config.test.ts holds the
 *  two to the same answer for every number either test names. */
export function dialable(phone: string): boolean {
  const raw = phone
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .trim();
  if (!/^\+[\d ().-]+$/.test(raw) || /\(\s*0\s*\)/.test(raw)) return false;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length !== 11) return false;
  return digits.length >= 8 && digits.length <= 15;
}

/** A general line that is set but cannot be dialled: the app would draw no call button with no word of why
 *  (`telHref`). Unset stays allowed — the app then says what to do instead of calling. */
function undialledPhone(env: Record<string, string | undefined>): boolean {
  const phone = env.EXPO_PUBLIC_SUPPORT_PHONE;
  return !!phone?.trim() && !dialable(phone);
}

/** Staging builds and updates read the API address from the EAS "preview" environment (the tunnel today, the company
 *  domain later), not from eas.json: without an https one the APK would crash at startup, so the build stops here. */
export function assertStagingEnv(env: Record<string, string | undefined>): void {
  if (env.EXPO_PUBLIC_APP_ENV !== "staging") return;
  if (!isHttpsUrl(env.EXPO_PUBLIC_API_URL)) {
    throw new Error("Staging build refused: EXPO_PUBLIC_API_URL (set it in the EAS preview environment)");
  }
  if (undialledPhone(env)) {
    throw new Error("Staging build refused: EXPO_PUBLIC_SUPPORT_PHONE (one number in E.164, or unset)");
  }
}

/** Production-only. Names every missing or invalid variable in one throw. Phone stays optional, but a set one must
 *  be a number the app can dial. */
export function assertProductionEnv(env: Record<string, string | undefined>): void {
  if (env.EXPO_PUBLIC_APP_ENV !== "production") return;
  const missing: string[] = [];
  if (!isHttpsUrl(env.EXPO_PUBLIC_API_URL)) missing.push("EXPO_PUBLIC_API_URL");
  if (!isHttpsUrl(env.EXPO_PUBLIC_PRIVACY_URL)) missing.push("EXPO_PUBLIC_PRIVACY_URL");
  if (!isHttpsUrl(env.EXPO_PUBLIC_TERMS_URL)) missing.push("EXPO_PUBLIC_TERMS_URL");
  if (undialledPhone(env)) missing.push("EXPO_PUBLIC_SUPPORT_PHONE");
  // Without it production would ship the drawn fallback globe instead of Mapbox (ADR-IMPL-035) — and never a secret token.
  if (!env.EXPO_PUBLIC_MAPBOX_TOKEN?.startsWith("pk.")) missing.push("EXPO_PUBLIC_MAPBOX_TOKEN");
  if (missing.length) {
    throw new Error(`Production build refused: ${missing.join(", ")}`);
  }
}

/** Android push needs Firebase's google-services.json inside the build: GOOGLE_SERVICES_JSON, an EAS file variable
 *  (its value is the file's path on the build machine), never a file in git. Unset, the build is exactly app.json and
 *  an Android phone registers no push token. Native: it reaches phones with a new build, never with an OTA update. */
export function withFirebase(app: ExpoConfig, env: Record<string, string | undefined>): ExpoConfig {
  const file = env.GOOGLE_SERVICES_JSON;
  if (!file) return app;
  return { ...app, android: { ...app.android, googleServicesFile: file } };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertStagingEnv(process.env);
  assertProductionEnv(process.env);
  const app = withFirebase(config as ExpoConfig, process.env); // app.json: name and slug are present
  if (process.env.EXPO_PUBLIC_APP_ENV !== "e2e") return app;
  return {
    ...app,
    updates: { ...app.updates, enabled: false },
    // By path, not import: Expo compiles a TypeScript plugin it resolves, not one app.config.ts requires.
    plugins: [...(app.plugins ?? []), "./plugins/with-e2e-cleartext.ts"],
  };
};
