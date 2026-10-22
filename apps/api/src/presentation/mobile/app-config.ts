import type { Platform } from "@bbc/platform";
import { errorForLog } from "@bbc/db";

const KILLABLE = ["proposals", "engagement", "requests", "notifications", "personalization", "members"];
/** The whole answer's budget: the app waits on it before its first screen. */
const READ_TIMEOUT_MS = 1_500;

export type AppConfig = {
  minSupportedVersion: string;
  recommendedVersion: string;
  killSwitches: Record<string, boolean>;
  maintenance: string | null;
};

/** A cold process that has never read the flags. */
const BUILT_IN: AppConfig = {
  minSupportedVersion: "0.1.0",
  recommendedVersion: "0.1.0",
  killSwitches: {},
  maintenance: null,
};

/** Per platform (one per process; tests build several), the last answer read in full. */
const lastGoodOf = new WeakMap<Platform, AppConfig>();

/** Every flag of the answer, through the strict reads: a flag that cannot be read is an error, never its default. */
async function readAll(platform: Platform): Promise<AppConfig> {
  const variant = async (key: string, fallback: string) => {
    const v = await platform.flags.readStrict(key);
    return typeof v?.variant === "string" ? v.variant : fallback;
  };
  const killStates = async () => {
    const out: Record<string, boolean> = {};
    for (const m of KILLABLE) out[m] = await platform.flags.killState(m);
    return out;
  };
  const [min, rec, maint, kills] = await Promise.all([
    variant("app.min_supported_version", "0.1.0"),
    variant("app.recommended_version", "0.1.0"),
    variant("app.maintenance_message", ""),
    killStates(),
  ]);
  return { minSupportedVersion: min, recommendedVersion: rec, killSwitches: kills, maintenance: maint || null };
}

/** First request of every cold start, before login. Must answer even if the DB is down: any read that fails or does not
 *  answer within 1.5 s serves the last answer read in full (the built-in values on a cold process), never a mix of
 *  defaults — a minimum version back at 0.1.0, every module killed. */
export async function appConfig(platform: Platform): Promise<AppConfig> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fresh = await Promise.race([
      readAll(platform),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`app-config flags unread after ${READ_TIMEOUT_MS} ms`)),
          READ_TIMEOUT_MS,
        );
      }),
    ]);
    lastGoodOf.set(platform, fresh);
    return fresh;
  } catch (e) {
    platform.logger.warn({ err: errorForLog(e) }, "app-config served its last good answer");
    return lastGoodOf.get(platform) ?? BUILT_IN;
  } finally {
    clearTimeout(timer);
  }
}
