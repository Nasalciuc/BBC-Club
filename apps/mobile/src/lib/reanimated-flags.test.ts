import { describe, expect, it } from "bun:test";
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

// Read at build time by Reanimated's Gradle and CocoaPods scripts (the app's own package.json), so a change needs a
// new native build; JSON has no room for the reason, which is in design/motion.md (resting styles).
const read = AppPackage.safeParse(JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf8")));

describe("Reanimated's static flags (design/motion.md, resting styles)", () => {
  it("reads the app's package.json", () => {
    expect(read.success).toBe(true);
  });

  it("keeps a view's last animated props for its life: the settled-props sync stays off", () => {
    // On: Reanimated 4.5.1 could erase them before React had them, and the next React commit drew gorhom's first
    // frame again — Explore's sheet transparent and a window height down while gorhom held it at rest.
    expect(read.data?.reanimated?.staticFeatureFlags?.FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS).toBe(false);
  });

  it("was decided for Reanimated 4.5.1: an upgrade re-reads design/motion.md before turning the sync back on", () => {
    expect(read.data?.dependencies["react-native-reanimated"]).toBe("4.5.1");
  });
});
