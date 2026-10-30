/** Staging's real data (ADR-IMPL-040, 30 Oct 2026) — the flags it turns on and how the deploy runs it; no database. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import { storedPricingRules } from "../packages/modules/domain/catalog/src/pricing/rules";
import { FIXTURE_RULES } from "../packages/modules/domain/catalog/tests/unit/pricing-rules.fixture";
import { STAGING_REAL_DATA_FLAGS, rulesLine, rulesState } from "./staging-real-data";

const deploy = readFileSync(join(import.meta.dir, "..", "infra/deploy.sh"), "utf8");

describe("staging real data — what it turns on", () => {
  it("the site's deals, pins and prices, under the estimates' master switch — never the site's photos", () => {
    expect([...STAGING_REAL_DATA_FLAGS]).toEqual([
      "catalog.estimates",
      "catalog.site_prices",
      "catalog.site_pins",
      "catalog.site_offers",
    ]);
    // The site's photos wait for the company to confirm the rights (seed-flags.ts).
    expect(STAGING_REAL_DATA_FLAGS).not.toContain("catalog.site_photos" as never);
  });
});

describe("infra/deploy.sh — staging only, after the demo, skipped by STAGING_REAL_DATA=off", () => {
  const staging = deploy.slice(deploy.indexOf('if [[ "$MODE" == "staging" ]]; then\n  echo "▶ 7/8'));
  const step7 = staging.slice(0, staging.indexOf("▶ 8/8"));

  it("runs in step 7's staging branch, after the demo, with staging's own database", () => {
    expect(step7.length).toBeGreaterThan(0);
    const demo = step7.indexOf("scripts/seed-staging-demo.ts");
    const real = step7.indexOf("scripts/staging-real-data.ts");
    expect(demo).toBeGreaterThan(-1);
    expect(real).toBeGreaterThan(demo);
    expect(step7.slice(0, step7.indexOf('else\n  echo "▶ 7/8 staging demo — production'))).toContain(
      "staging-real-data.ts",
    );
    expect(step7).toContain('-e DATABASE_URL="$MIGRATE_URL"');
  });

  it("reads the switch from staging.env, and a failure is announced, never a failed deploy", () => {
    expect(step7).toContain('"$(env_value "$STG_ENV" STAGING_REAL_DATA)" == "off"');
    expect(step7).toContain("the real data's flags were not set");
  });

  it("starts the site's sync only when a flag was just turned on", async () => {
    const gate = step7.match(/grep -q '([^']+)' <<<"\$REAL"/)?.[1];
    expect(gate).toBe("^changed: [1-9]");
    const starts = async (out: string) =>
      (await Bun.spawn(["bash", "-c", `grep -q '${gate}' <<<"$1"`, "_", out]).exited) === 0;
    expect(await starts("staging real data: on\nprice rules: loaded\nchanged: 4")).toBe(true);
    expect(await starts("staging real data: on\nprice rules: loaded\nchanged: 0")).toBe(false);
    expect(await starts("changed: 10")).toBe(true);
  });
});

describe("the price rules, as a search reads them — never a rule in the log", () => {
  const stored = storedPricingRules(FIXTURE_RULES);

  it("loaded only when the catalogue would use them: shape and fingerprint", () => {
    expect(rulesState(stored)).toEqual({ state: "loaded", fingerprint: stored.fingerprint });
    expect(rulesState(undefined)).toEqual({ state: "missing" });
    expect(rulesState({ fingerprint: "test" })).toEqual({ state: "invalid" });
    expect(rulesState({ ...stored, fingerprint: "0000000000000000" })).toEqual({ state: "invalid" }); // a hand edit
  });

  it("each state's line says what a search shows, and prints the fingerprint alone", () => {
    expect(rulesLine(rulesState(stored))).toBe(`price rules: loaded (fingerprint ${stored.fingerprint})`);
    expect(rulesLine({ state: "missing" })).toMatch(/^price rules: not loaded — .*no number elsewhere/);
    expect(rulesLine({ state: "invalid" })).toMatch(/^price rules: invalid .*load them again/);
    for (const amount of Object.values(FIXTURE_RULES.hawaii_extra)) {
      expect(rulesLine(rulesState(stored))).not.toContain(String(amount));
    }
  });
});

describe("infra/deploy.sh — the site's sync after the flags: a start, or announced", () => {
  const js = deploy.match(/^SITE_SYNC_JS="(.*)"$/m)?.[1];

  /** The deploy's JavaScript with `fetch` answering as given; its exit code and what it printed. */
  async function sync(answer: string) {
    const p = Bun.spawn(["bun", "-e", `globalThis.fetch = async () => { ${answer} };\n${js}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([
      p.exited,
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
    ]);
    return { code, text: out + err };
  }

  it("is defined once and used by step 7", () => {
    expect(js).toBeTruthy();
    expect(deploy).toContain('docker exec "$W" bun -e "$SITE_SYNC_JS"');
  });

  it("still running after 5 s is a start — the run takes minutes", async () => {
    const r = await sync(`throw new DOMException("The operation timed out.", "TimeoutError");`);
    expect([r.code, r.text.trim()]).toEqual([0, "site sync: started, it runs for a few minutes"]);
  });

  it("a run finished within the 5 s says how it ended; a failed one is announced", async () => {
    expect((await sync(`return new Response(JSON.stringify({ status: "succeeded" }));`)).code).toBe(0);
    const failed = await sync(`return new Response(JSON.stringify({ status: "failed", error: "site down" }));`);
    expect([failed.code, failed.text.trim()]).toEqual([1, "site sync: failed: site down"]);
  });

  it("a refusal or no connection at all is announced, never read as a start", async () => {
    const refused = await sync(`return new Response("{}", { status: 401 });`);
    expect([refused.code, refused.text.trim()]).toEqual([1, "site sync: refused, HTTP 401"]);
    const down = await sync(`throw new TypeError("fetch failed");`);
    expect([down.code, down.text.trim()]).toEqual([1, "site sync: no answer (TypeError)"]);
  });
});
