/** /v1/app-config is the first request of every cold start. With the database down it answers at once with the last
 *  answer it read in full — never a mix of fallbacks (minimum version 0.1.0, every module killed). */
import { describe, expect, it } from "bun:test";
import type { Platform } from "@bbc/platform";
import { appConfig } from "../src/presentation/mobile/app-config";
import { testApp } from "./helpers/test-app";

type Flag = { enabled?: boolean; variant?: string };

/** The modules a process runs, as index.ts passes them (the registry's). */
const MODULES = ["identity", "members", "catalog", "requests", "proposals", "notifications"] as const;

/** Flags as the real ones behave: the strict reads (readStrict, killState) throw or hang with the database; variant
 *  and killSwitches swallow the error into the caller's fallback and a fail-closed kill. */
function fakePlatform(values: Record<string, Flag>) {
  const state = { mode: "ok" as "ok" | "down" | "hang", values: { ...values } };
  const warned: string[] = [];
  const gate = <T>(v: () => T): Promise<T> =>
    state.mode === "down"
      ? Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:6432"))
      : state.mode === "hang"
        ? new Promise<T>(() => {})
        : Promise.resolve(v());
  const flags = {
    readStrict: (key: string) => gate(() => state.values[key] ?? null),
    killState: (m: string) => gate(() => state.values[`${m}.killed`]?.enabled === true),
    variant: (key: string, fallback: string) =>
      gate(() => state.values[key]?.variant ?? fallback).catch(() => fallback),
    killSwitches: async (modules: string[]) => {
      const out: Record<string, boolean> = {};
      for (const m of modules) out[m] = await flags.killState(m).catch(() => true);
      return out;
    },
  };
  const platform = {
    flags,
    logger: { warn: (_o: object, m?: string) => void warned.push(m ?? ""), info() {}, error() {} },
  } as unknown as Platform;
  return { platform, state, warned };
}

describe("appConfig", () => {
  it("serves the last answer it read in full while the database is down, within 2 s", async () => {
    const f = fakePlatform({ "app.min_supported_version": { variant: "2.0.0" }, "requests.killed": { enabled: true } });
    const good = await appConfig(f.platform, MODULES);
    expect(good.minSupportedVersion).toBe("2.0.0");
    expect(good.killSwitches).toMatchObject({ requests: true, proposals: false });

    f.state.mode = "down";
    const started = Date.now();
    expect(await appConfig(f.platform, MODULES)).toEqual(good);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(f.warned).toContain("app-config served its last good answer");

    f.state.mode = "hang";
    const hangStarted = Date.now();
    expect(await appConfig(f.platform, MODULES)).toEqual(good);
    expect(Date.now() - hangStarted).toBeLessThan(2_000);

    f.state.mode = "ok";
    f.state.values["app.min_supported_version"] = { variant: "2.1.0" };
    expect((await appConfig(f.platform, MODULES)).minSupportedVersion).toBe("2.1.0");
  });

  it("a cold process with the database down answers the built-in values, not every module killed", async () => {
    const f = fakePlatform({});
    f.state.mode = "down";
    const cold = await appConfig(f.platform, MODULES);
    expect(cold.minSupportedVersion).toBe("0.1.0");
    expect(Object.values(cold.killSwitches).some(Boolean)).toBe(false);
  });

  it("carries each platform's store listing the operator set, and only a store or https address", async () => {
    const ios = "itms-apps://apps.apple.com/app/id1234567890";
    const android = "market://details?id=com.buybusinessclass.club";
    const f = fakePlatform({ "app.store_url_ios": { variant: ios }, "app.store_url_android": { variant: android } });
    expect((await appConfig(f.platform, MODULES)).storeUrl).toEqual({ ios, android });

    f.state.values["app.store_url_android"] = { variant: "javascript:alert(1)" };
    f.state.values["app.store_url_ios"] = { variant: "https://apps.apple.com/app/id1234567890" };
    expect((await appConfig(f.platform, MODULES)).storeUrl).toEqual({ ios: "https://apps.apple.com/app/id1234567890" });

    f.state.values["app.store_url_ios"] = { variant: "http://apps.apple.com/app/id1234567890" };
    expect(await appConfig(f.platform, MODULES)).not.toHaveProperty("storeUrl");

    const unset = fakePlatform({});
    expect(await appConfig(unset.platform, MODULES)).not.toHaveProperty("storeUrl");
  });

  it("GET /v1/app-config reads the flags the operator set", async () => {
    const t = await testApp({ suite: "app-config" });
    expect(await (await t.app.request("/v1/app-config")).json()).not.toHaveProperty("storeUrl");
    await t.flags.set("app.min_supported_version", { variant: "2.0.0" });
    await t.flags.set("app.maintenance_message", { variant: "Back at 10:00." });
    await t.flags.set("app.store_url_ios", { variant: "https://apps.apple.com/app/id1234567890" });
    await t.flags.set("app.store_url_android", { variant: "market://details?id=com.buybusinessclass.club" });
    const res = await t.app.request("/v1/app-config");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      minSupportedVersion: "2.0.0",
      maintenance: "Back at 10:00.",
      killSwitches: { requests: false },
      storeUrl: {
        ios: "https://apps.apple.com/app/id1234567890",
        android: "market://details?id=com.buybusinessclass.club",
      },
    });
    await t.close();
  });
});
