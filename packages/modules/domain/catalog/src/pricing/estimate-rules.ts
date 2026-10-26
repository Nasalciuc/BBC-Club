import { errorForLog } from "@bbc/db";
import type { ModulePlatform } from "@bbc/shared/module-contract";
import { readStoredRules, type RulesLookup } from "./rules";

/**
 * One rule for the search, the quote request that follows it and Home's site pins (ADR-IMPL-037, ADR-IMPL-042,
 * ADR-IMPL-045): the company's formula, when estimates are on and this environment holds valid rules. Both flag rows are
 * cached (~35 s to reach every replica) and a failed read of the switch counts as off. Without valid rules there is no
 * estimate, never an error, and the reason is counted: `missing` (no row: load the rules), `invalid` (edited by hand:
 * load them again), `error` (the row could not be read: the database or the cache, not the rules).
 */
export async function estimateRules(
  platform: Pick<ModulePlatform, "flags" | "metrics" | "logger">,
  metric: "search" | "request" | "home",
): Promise<StoredRules | null> {
  if (!(await platform.flags.isEnabled("catalog.estimates", false))) return null;
  return readRules(platform, metric);
}

export type StoredRules = Extract<RulesLookup, { ok: true }>;

/**
 * What may price an estimate now (ADR-IMPL-063): null while `catalog.estimates` — the master switch — is off; else
 * whether the company's site prices them (`catalog.site_prices`, off unless set) and the formula's rules, when this
 * environment holds valid ones (missing ones are counted as `estimateRules` counts them). With the site off, no valid
 * rules is no estimate, as before: null. With it on, the site's answers are shown without rules; only the fallback is
 * missing.
 */
export async function estimateSources(
  platform: Pick<ModulePlatform, "flags" | "metrics" | "logger">,
  metric: "search" | "request" | "home",
): Promise<{ site: boolean; rules: StoredRules | null } | null> {
  if (!(await platform.flags.isEnabled("catalog.estimates", false))) return null;
  const site = await platform.flags.isEnabled("catalog.site_prices", false);
  const rules = await readRules(platform, metric);
  if (!site && !rules) return null;
  return { site, rules };
}

async function readRules(
  platform: Pick<ModulePlatform, "flags" | "metrics" | "logger">,
  metric: "search" | "request" | "home",
): Promise<StoredRules | null> {
  let value: Record<string, unknown> | null;
  try {
    value = await platform.flags.readStrict("catalog.pricing_rules");
  } catch (err) {
    platform.metrics.inc(`${metric}_estimates_unavailable`, { reason: "error" });
    platform.logger.warn({ metric, err: errorForLog(err) }, "pricing rules unreadable");
    return null;
  }
  const stored = readStoredRules(value);
  if (!stored.ok) {
    platform.metrics.inc(`${metric}_estimates_unavailable`, { reason: stored.reason });
    return null;
  }
  return stored;
}
