import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const AppPackage = z.object({
  dependencies: z.record(z.string()),
  reanimated: z
    .object({ staticFeatureFlags: z.record(z.boolean()) })
    .partial()
    .optional(),
});

const APP = join(import.meta.dir, "..", "..");
const REPO = join(APP, "..", "..");

// Read at build time by Reanimated's Gradle and CocoaPods scripts (the app's own package.json), so a change needs a
// new native build; JSON has no room for the reason, which is in ADR-IMPL-069 and design/motion.md (resting styles).
const read = AppPackage.safeParse(JSON.parse(readFileSync(join(APP, "package.json"), "utf8")));

/** Expo's switch to its precompiled modules: its iOS Reanimated is built with the sync on and ignores the flag. */
const PRECOMPILED = "EXPO_USE_PRECOMPILED_MODULES";

describe("Reanimated's static flags (ADR-IMPL-069; design/motion.md, resting styles)", () => {
  it("reads the app's package.json", () => {
    expect(read.success).toBe(true);
  });

  it("keeps a view's last animated props for its life: the settled-props sync stays off", () => {
    // On, Reanimated 4.5.1's sources read as able to erase them before React had them; the next React commit would
    // then draw gorhom's first frame again: Explore's sheet transparent and a window height down while gorhom held it
    // at rest. Not reproduced on a device: parity's HomeSheet trace confirms (`lost`) or refutes (`closed`) it.
    expect(read.data?.reanimated?.staticFeatureFlags?.FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS).toBe(false);
  });

  it("was decided for Reanimated 4.5.1: an upgrade re-reads ADR-IMPL-069 before turning the sync back on", () => {
    expect(read.data?.dependencies["react-native-reanimated"]).toBe("4.5.1");
  });

  it("builds Reanimated from source: no build profile or workflow turns on Expo's precompiled modules", () => {
    // expo-modules-autolinking's precompiled iOS Reanimated is compiled with FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS
    // on and never reads the app's package.json. An EAS environment variable set on the server is out of this reach.
    const workflows = join(REPO, ".github", "workflows");
    const files = [
      join(APP, "eas.json"),
      ...readdirSync(workflows)
        .filter((name) => /\.ya?ml$/.test(name))
        .map((name) => join(workflows, name)),
    ];
    const setting = files.filter((file) => readFileSync(file, "utf8").includes(PRECOMPILED));
    expect(setting).toEqual([]);
  });
});
