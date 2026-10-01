import type { ConfigContext, ExpoConfig } from "expo/config";

/** app.json stays the source of truth. Every build resolves to exactly app.json — production included —
 *  except the e2e APK (EXPO_PUBLIC_APP_ENV=e2e, built by .github/workflows/e2e-android.yml), which may speak
 *  cleartext to the emulator host and runs the bundle it was built with, never an OTA update. */

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Production-only. Names every missing or invalid variable in one throw. Phone stays optional. */
export function assertProductionEnv(env: Record<string, string | undefined>): void {
  if (env.EXPO_PUBLIC_APP_ENV !== "production") return;
  const missing: string[] = [];
  if (!isHttpsUrl(env.EXPO_PUBLIC_API_URL)) missing.push("EXPO_PUBLIC_API_URL");
  if (!isUrl(env.EXPO_PUBLIC_PRIVACY_URL)) missing.push("EXPO_PUBLIC_PRIVACY_URL");
  if (!isUrl(env.EXPO_PUBLIC_TERMS_URL)) missing.push("EXPO_PUBLIC_TERMS_URL");
  if (missing.length) {
    throw new Error(`Production build refused: ${missing.join(", ")}`);
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertProductionEnv(process.env);
  const app = config as ExpoConfig; // app.json: name and slug are present
  if (process.env.EXPO_PUBLIC_APP_ENV !== "e2e") return app;
  return {
    ...app,
    updates: { ...app.updates, enabled: false },
    // By path, not import: Expo compiles a TypeScript plugin it resolves, not one app.config.ts requires.
    plugins: [...(app.plugins ?? []), "./plugins/with-e2e-cleartext.ts"],
  };
};
