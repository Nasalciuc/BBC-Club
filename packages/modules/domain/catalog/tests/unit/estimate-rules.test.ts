import { describe, expect, it } from "bun:test";
import { estimateRules, estimateSources } from "../../src/pricing/estimate-rules";
import { storedPricingRules } from "../../src/pricing/rules";
import { FIXTURE_RULES } from "./pricing-rules.fixture";

/** A platform whose switch is on and whose rules row answers `rules` (or throws it). */
function platformWith(rules: () => Promise<Record<string, unknown> | null>) {
  const counted: { name: string; labels?: Record<string, string> }[] = [];
  const warned: object[] = [];
  const platform = {
    flags: {
      isEnabled: async (key: string) => key === "catalog.estimates",
      variant: async (_key: string, fallback: string) => fallback,
      isKilled: async () => false,
      isConsumerPaused: async () => false,
      read: async () => null,
      readStrict: rules,
    },
    metrics: { inc: (name: string, labels?: Record<string, string>) => void counted.push({ name, labels }) },
    logger: { info: () => undefined, warn: (o: object) => void warned.push(o), error: () => undefined },
  };
  return { platform, counted, warned };
}

describe("estimateRules — why there is no estimate is counted as what it is", () => {
  it("valid rules: the formula's rules and their fingerprint, nothing counted", async () => {
    const { platform, counted } = platformWith(async () => storedPricingRules(FIXTURE_RULES));
    const stored = await estimateRules(platform, "search");
    expect(stored?.fingerprint).toBe(storedPricingRules(FIXTURE_RULES).fingerprint);
    expect(counted).toEqual([]);
  });

  it("no row is `missing` — the runbook's answer is to load the rules", async () => {
    const { platform, counted } = platformWith(async () => null);
    expect(await estimateRules(platform, "search")).toBeNull();
    expect(counted).toEqual([{ name: "search_estimates_unavailable", labels: { reason: "missing" } }]);
  });

  it("a row that could not be read is `error`, never `missing`: the database or the cache failed, not the rules", async () => {
    const { platform, counted, warned } = platformWith(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    expect(await estimateRules(platform, "request")).toBeNull();
    expect(counted).toEqual([{ name: "request_estimates_unavailable", labels: { reason: "error" } }]);
    expect(warned).toHaveLength(1);
  });

  it("estimates off: no estimate and nothing read or counted", async () => {
    const { platform, counted } = platformWith(async () => {
      throw new Error("must not be read");
    });
    platform.flags.isEnabled = async () => false;
    expect(await estimateRules(platform, "home")).toBeNull();
    expect(counted).toEqual([]);
  });
});

describe("estimateSources — what may price an estimate (ADR-IMPL-063)", () => {
  const on = (keys: string[]) => async (key: string) => keys.includes(key);

  it("the site off: the rules, or nothing — exactly as estimateRules", async () => {
    const { platform } = platformWith(async () => storedPricingRules(FIXTURE_RULES));
    expect(await estimateSources(platform, "search")).toEqual({
      site: false,
      rules: (await estimateRules(platform, "search"))!,
    });
    const without = platformWith(async () => null);
    expect(await estimateSources(without.platform, "search")).toBeNull();
    expect(without.counted).toEqual([{ name: "search_estimates_unavailable", labels: { reason: "missing" } }]);
  });

  it("the site on: it prices without rules; only the fallback is missing, and that is counted", async () => {
    const { platform, counted } = platformWith(async () => null);
    platform.flags.isEnabled = on(["catalog.estimates", "catalog.site_prices"]);
    expect(await estimateSources(platform, "home")).toEqual({ site: true, rules: null });
    expect(counted).toEqual([{ name: "home_estimates_unavailable", labels: { reason: "missing" } }]);
  });

  it("estimates off is the master switch: the site's flag on changes nothing, nothing is read", async () => {
    const { platform, counted } = platformWith(async () => {
      throw new Error("must not be read");
    });
    platform.flags.isEnabled = on(["catalog.site_prices"]);
    expect(await estimateSources(platform, "request")).toBeNull();
    expect(counted).toEqual([]);
  });
});
