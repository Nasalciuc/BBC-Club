import type { ConfigContext, ExpoConfig } from "expo/config";

/** app.json stays the source of truth. Every build resolves to exactly app.json — production included —
 *  except the e2e APK (EXPO_PUBLIC_APP_ENV=e2e, built by .github/workflows/e2e-android.yml), which may speak
 *  cleartext to the emulator host and runs the bundle it was built with, never an OTA update. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const app = config as ExpoConfig; // app.json: name and slug are present
  if (process.env.EXPO_PUBLIC_APP_ENV !== "e2e") return app;
  return {
    ...app,
    updates: { ...app.updates, enabled: false },
    // By path, not import: Expo compiles a TypeScript plugin it resolves, not one app.config.ts requires.
    plugins: [...(app.plugins ?? []), "./plugins/with-e2e-cleartext.ts"],
  };
};
