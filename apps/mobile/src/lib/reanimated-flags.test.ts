import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const AppPackage = z.object({
  dependencies: z.record(z.string()),
  reanimated: z
    .object({ staticFeatureFlags: z.record(z.boolean()) })
    .partial()
    .optional(),
});

/** What CocoaPods hands to Expo's precompiled modules from `expo-modules-autolinking resolve --platform apple`. */
const AppleResolve = z.object({
  configuration: z
    .object({ buildFromSource: z.array(z.string()) })
    .partial()
    .optional(),
});

const APP = join(import.meta.dir, "..", "..");

// Read at build time by Reanimated's Gradle and CocoaPods scripts (the app's own package.json), so a change needs a
// new native build; JSON has no room for the reason, which is in ADR-IMPL-069 and design/motion.md (resting styles).
const read = AppPackage.safeParse(JSON.parse(readFileSync(join(APP, "package.json"), "utf8")));

/** Reanimated's iOS pod and its npm package: expo-modules-autolinking matches `buildFromSource` against both. */
const REANIMATED_IOS = ["RNReanimated", "react-native-reanimated"] as const;

describe("Reanimated's static flags (ADR-IMPL-069; design/motion.md, resting styles)", () => {
  it("reads the app's package.json", () => {
    expect(read.success).toBe(true);
  });

  it("keeps a view's last animated props for its life: the settled-props sync stays off", () => {
    // On, Reanimated 4.5.1's sources read as able to erase them before React had them; the next React commit would
    // then draw gorhom's first frame again: Explore's sheet transparent and a window height down while gorhom held it
    // at rest. Not reproduced on a device, and parity cannot confirm it while this holds: a `lost` HomeSheet trace from
    // a build with the sync off (`sync=off`) means the props were lost some other way (ADR-IMPL-069, what a run shows).
    expect(read.data?.reanimated?.staticFeatureFlags?.FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS).toBe(false);
  });

  it("was decided for Reanimated 4.5.1: an upgrade re-reads ADR-IMPL-069 before turning the sync back on", () => {
    expect(read.data?.dependencies["react-native-reanimated"]).toBe("4.5.1");
  });

  it("builds Reanimated from source on iOS, whatever precompiled modules the build turns on", () => {
    // SDK 57's prebuild Podfile sets EXPO_USE_PRECOMPILED_MODULES to 1 unless it is set otherwise, and EAS may export
    // it. Reanimated then comes as Expo's XCFramework whenever a tarball resolves (a local build, or a download from
    // EXPO_PRECOMPILED_MODULES_BASE_URL): it is compiled with FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS on and never
    // reads this package.json. An entry in `expo.autolinking.ios.buildFromSource` decides before any of that
    // (precompiled_modules.rb, `build_from_source?`). This is the command `use_expo_modules!` runs to read it
    // (autolinking_manager.rb), from the app's folder as `pod install` finds it.
    const run = spawnSync(
      process.execPath,
      [
        "--eval",
        "require('expo/bin/autolinking')",
        "expo-modules-autolinking",
        "resolve",
        "--platform",
        "apple",
        "--json",
      ],
      { cwd: APP, encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    const patterns = AppleResolve.parse(JSON.parse(run.stdout)).configuration?.buildFromSource ?? [];
    // Each entry is a whole-name pattern against the pod or its npm package, as precompiled_modules.rb builds it.
    const fromSource = REANIMATED_IOS.filter((name) => patterns.some((p) => new RegExp(`^${p}$`).test(name)));
    expect(fromSource).not.toEqual([]);
  }, 30_000);
});
