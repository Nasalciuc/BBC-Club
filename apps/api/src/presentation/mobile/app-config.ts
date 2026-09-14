import type { Platform } from "@bbc/platform";

const KILLABLE = ["proposals", "engagement", "notifications", "personalization", "members"];
let lastGood: any = { minSupportedVersion: "0.1.0", recommendedVersion: "0.1.0", killSwitches: {}, maintenance: null };

/** First request of every cold start, before login. Must answer even if the DB is down → serve the last good value. */
export async function appConfig(platform: Platform) {
  try {
    const [min, rec, maint, kills] = await Promise.all([
      platform.flags.variant("app.min_supported_version", "0.1.0"),
      platform.flags.variant("app.recommended_version", "0.1.0"),
      platform.flags.variant("app.maintenance_message", ""),
      platform.flags.killSwitches(KILLABLE),
    ]);
    lastGood = { minSupportedVersion: min, recommendedVersion: rec, killSwitches: kills, maintenance: maint || null };
  } catch (e) {
    platform.logger.warn({ err: String(e) }, "app-config served from cache");
  }
  return lastGood;
}
