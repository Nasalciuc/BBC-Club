/**
 * D4, ADR-IMPL-070: the JavaScript that opens the picker must never run on a build without its native module. The
 * picker's and the manipulator's packages ask the runtime for their module as they load, so a binary without it (0.2.0,
 * reached by an update over the air) would crash at the first import. This holds the app to one door: only
 * photo-native.ts names them, only through `import()`, and only after `photoPickerReady` — and the names the guard asks
 * for are the packages' own.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { PHOTO_NATIVE_MODULES } from "./photo-logic";

const SRC = join(import.meta.dir, "../..");
const PACKAGES = ["expo-image-picker", "expo-image-manipulator"] as const;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the photo picker's one door", () => {
  it("no file but photo-native.ts names the packages; it loads them only with import()", () => {
    const naming = sources(SRC)
      .filter((f) => PACKAGES.some((p) => readFileSync(f, "utf8").includes(`"${p}"`)))
      .map((f) => relative(SRC, f));
    expect(naming).toEqual(["features/profile/photo-native.ts"]);

    const door = readFileSync(join(SRC, "features/profile/photo-native.ts"), "utf8");
    for (const p of PACKAGES) {
      // No static import, no require: either would load the package with the screen.
      expect(door).not.toMatch(new RegExp(`from\\s+"${p}"`));
      expect(door).not.toMatch(new RegExp(`require\\(\\s*"${p}"`));
      expect(door).toContain(`await import("${p}")`);
    }
  });

  it("the guard comes before the first import(), and the app is asked once", () => {
    const door = readFileSync(join(SRC, "features/profile/photo-native.ts"), "utf8");
    const guard = door.indexOf("if (!photoPickerReady) return");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(door.indexOf("await import("));
    expect(door).toContain("photoPickerAvailable((name) => requireOptionalNativeModule(name))");
  });

  it("the Photo row and its sheet stand behind the same guard on Edit profile", () => {
    const screen = readFileSync(join(SRC, "app/edit-profile.tsx"), "utf8");
    expect(screen).toMatch(/\{photoPickerReady \? \(\s*<ListRow\s+testID="editProfile\.photo"/);
    expect(screen).toContain("{photoPickerReady ? <PhotoSheet");
  });

  it("the guard asks for the modules by the names the packages themselves load", () => {
    const loaded = PACKAGES.flatMap((p) => {
      const root = dirname(require.resolve(`${p}/package.json`));
      return sources(join(root, "src")).flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/requireNativeModule(?:<[^>]*>)?\(\s*'([A-Za-z]+)'\s*\)/g)].map(
          (m) => m[1],
        ),
      );
    });
    expect([...new Set(loaded)].sort()).toEqual([...PHOTO_NATIVE_MODULES].sort());
  });
});
