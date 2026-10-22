/** /v1/app-config is the first request of every cold start. With the database down it answers at once with the last
 *  answer it read in full — never a mix of fallbacks (minimum version 0.1.0, every module killed). */
import { describe, expect, it } from "bun:test";
import type { Platform } from "@bbc/platform";
import { appConfig } from "../src/presentation/mobile/app-config";
import { testApp } from "./helpers/test-app";

type Flag = { enabled?: boolean; variant?: string };

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
    const good = await appConfig(f.platform);
    expect(good.minSupportedVersion).toBe("2.0.0");
    expect(good.killSwitches).toMatchObject({ requests: true, proposals: false });

    f.state.mode = "down";
    const started = Date.now();
    expect(await appConfig(f.platform)).toEqual(good);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(f.warned).toContain("app-config served its last good answer");

    f.state.mode = "hang";
    const hangStarted = Date.now();
    expect(await appConfig(f.platform)).toEqual(good);
    expect(Date.now() - hangStarted).toBeLessThan(2_000);

    f.state.mode = "ok";
    f.state.values["app.min_supported_version"] = { variant: "2.1.0" };
    expect((await appConfig(f.platform)).minSupportedVersion).toBe("2.1.0");
  });

  it("a cold process with the database down answers the built-in values, not every module killed", async () => {
    const f = fakePlatform({});
    f.state.mode = "down";
    const cold = await appConfig(f.platform);
    expect(cold.minSupportedVersion).toBe("0.1.0");
    expect(Object.values(cold.killSwitches).some(Boolean)).toBe(false);
  });

  it("GET /v1/app-config reads the flags the operator set", async () => {
    const t = await testApp({ suite: "app-config" });
    await t.flags.set("app.min_supported_version", { variant: "2.0.0" });
    await t.flags.set("app.maintenance_message", { variant: "Back at 10:00." });
    const res = await t.app.request("/v1/app-config");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      minSupportedVersion: "2.0.0",
      maintenance: "Back at 10:00.",
      killSwitches: { requests: false },
    });
    await t.close();
  });
});
