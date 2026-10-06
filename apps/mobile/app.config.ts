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

/** Staging builds and updates read the API address from the EAS "preview" environment (the tunnel today, the company
 *  domain later), not from eas.json: without an https one the APK would crash at startup, so the build stops here. */
export function assertStagingEnv(env: Record<string, string | undefined>): void {
  if (env.EXPO_PUBLIC_APP_ENV !== "staging") return;
  if (!isHttpsUrl(env.EXPO_PUBLIC_API_URL)) {
    throw new Error("Staging build refused: EXPO_PUBLIC_API_URL (set it in the EAS preview environment)");
  }
}

/** Production-only. Names every missing or invalid variable in one throw. Phone stays optional. */
export function assertProductionEnv(env: Record<string, string | undefined>): void {
  if (env.EXPO_PUBLIC_APP_ENV !== "production") return;
  const missing: string[] = [];
  if (!isHttpsUrl(env.EXPO_PUBLIC_API_URL)) missing.push("EXPO_PUBLIC_API_URL");
  if (!isHttpsUrl(env.EXPO_PUBLIC_PRIVACY_URL)) missing.push("EXPO_PUBLIC_PRIVACY_URL");
  if (!isHttpsUrl(env.EXPO_PUBLIC_TERMS_URL)) missing.push("EXPO_PUBLIC_TERMS_URL");
  // Without it production would ship the drawn fallback globe instead of Mapbox (ADR-IMPL-035) — and never a secret token.
  if (!env.EXPO_PUBLIC_MAPBOX_TOKEN?.startsWith("pk.")) missing.push("EXPO_PUBLIC_MAPBOX_TOKEN");
  if (missing.length) {
    throw new Error(`Production build refused: ${missing.join(", ")}`);
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertStagingEnv(process.env);
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
