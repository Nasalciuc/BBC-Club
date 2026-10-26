/** The fonts the app loads and the ones the Android build embeds are one list (constants/fonts.ts, ADR-IMPL-072). */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { z } from "zod";
import { tokens } from "@bbc/ui/tokens";
import { Club } from "./club";
import { CLUB_FONT_FILES } from "./fonts";

const APP = join(import.meta.dir, "..", "..");
const families = Object.keys(CLUB_FONT_FILES);
const files = Object.values(CLUB_FONT_FILES);

/** The `expo-font` entry of `app.json`'s plugins: `["expo-font", { android: { fonts: [...] } }]`. */
const FontPlugin = z.tuple([
  z.literal("expo-font"),
  z.object({ android: z.object({ fonts: z.array(z.string()) }).strict() }).strict(),
]);
const AppJson = z.object({ expo: z.object({ plugins: z.array(z.unknown()) }) });
const plugins = AppJson.parse(JSON.parse(readFileSync(join(APP, "app.json"), "utf8"))).expo.plugins;
const fontPlugins = plugins.filter((p) => p === "expo-font" || (Array.isArray(p) && p[0] === "expo-font"));

/** `rn()`'s weights (packages/ui/src/rn-type.ts): the file of `Inter Tight` at each weight the tokens use. */
const INTER_TIGHT: Record<string, string> = {
  "400": "InterTight_400Regular",
  "500": "InterTight_500Medium",
  "600": "InterTight_600SemiBold",
  "700": "InterTight_700Bold",
};

describe("the fonts the app draws with", () => {
  it("holds every family the entry's own type uses (club.ts)", () => {
    for (const role of Object.values(Club.type)) expect(families).toContain(role.fontFamily);
  });

  it("holds Inter Tight at every weight a 3.0 role uses", () => {
    const weights = new Set(Object.values(tokens.type).map((role) => String(role.fontWeight)));
    for (const role of Object.values(tokens.type)) expect(role.fontFamily).toBe("Inter Tight");
    for (const weight of weights) {
      expect(INTER_TIGHT[weight]).toBeDefined();
      expect(families).toContain(INTER_TIGHT[weight]!);
    }
  });

  it("names each file as its family: an embedded Android font's family is its file's name", () => {
    for (const [family, file] of Object.entries(CLUB_FONT_FILES)) expect(basename(file)).toBe(`${family}.ttf`);
  });

  it("finds each file from the app, as the config plugin resolves it at prebuild", () => {
    const resolve = createRequire(join(APP, "package.json")).resolve;
    for (const file of files) expect(() => resolve(file)).not.toThrow();
  });
});

describe("app.json embeds exactly the fonts the app loads (expo-font's config plugin)", () => {
  it("has one expo-font entry, Android only (iOS names an embedded font by the file's own family)", () => {
    expect(fontPlugins).toHaveLength(1);
    expect(FontPlugin.safeParse(fontPlugins[0]).success).toBe(true);
  });

  it("lists the same files, in the same order", () => {
    const parsed = FontPlugin.parse(fontPlugins[0]);
    expect(parsed[1].android.fonts).toEqual(files);
  });
});
