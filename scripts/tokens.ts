/** DESIGN.md front-matter (YAML) → packages/ui/src/tokens.ts + apps/mobile/tailwind.theme.js
 *  The YAML is the only source. `--check` regenerates in memory and fails on any diff (used by validate). */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "yaml";

const DESIGN = "DESIGN.md";
const OUT_TS = "packages/ui/src/tokens.ts";
const OUT_TW = "apps/mobile/tailwind.theme.js";
const check = process.argv.includes("--check");

const md = readFileSync(DESIGN, "utf8");
const fm = md.match(/^---\n([\s\S]*?)\n---/);
if (!fm) throw new Error("DESIGN.md has no YAML front-matter");
const y = parse(fm[1]) as {
  colors: Record<string, string>;
  typography: Record<
    string,
    { fontFamily: string; fontSize: string; fontWeight: number; lineHeight: number; letterSpacing?: string }
  >;
  rounded: Record<string, string>;
  spacing: Record<string, string>;
  components: Record<string, Record<string, string>>;
};

const px = (v: string) => Number(String(v).replace("px", ""));
const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const family = (f: string) => f.split(",")[0].trim();

// ── tokens.ts ─────────────────────────────────────────────────────────────────
const colors = Object.fromEntries(Object.entries(y.colors).map(([k, v]) => [camel(k), v]));
const type = Object.fromEntries(
  Object.entries(y.typography).map(([k, t]) => [
    camel(k),
    {
      fontFamily: family(t.fontFamily),
      fontSize: px(t.fontSize),
      fontWeight: String(t.fontWeight),
      lineHeight: Math.round(px(t.fontSize) * t.lineHeight),
      letterSpacing: t.letterSpacing ? Number(String(t.letterSpacing).replace("px", "")) : 0,
    },
  ]),
);
const radius = Object.fromEntries(Object.entries(y.rounded).map(([k, v]) => [camel(k), px(v) >= 9999 ? 999 : px(v)]));
const space = Object.fromEntries(Object.entries(y.spacing).map(([k, v]) => [camel(k), px(v)]));

const ts = `// GENERATED from DESIGN.md — do not edit. Run \`bun run tokens\`.
export const tokens = {
  colors: ${JSON.stringify(colors, null, 2)},
  type: ${JSON.stringify(type, null, 2)},
  radius: ${JSON.stringify(radius, null, 2)},
  space: ${JSON.stringify(space, null, 2)},
} as const;
export type ColorToken = keyof typeof tokens.colors;
export type TypeToken = keyof typeof tokens.type;
`;

// ── tailwind.theme.js (Uniwind / Tailwind v4 theme) ──────────────────────────
const tw = `// GENERATED from DESIGN.md — do not edit. Run \`bun run tokens\`.
module.exports = {
  colors: ${JSON.stringify(y.colors, null, 2)},
  fontFamily: ${JSON.stringify(Object.fromEntries([...new Set(Object.values(y.typography).map((t) => family(t.fontFamily)))].map((f) => [f.toLowerCase().replace(/\s+/g, "-"), [f]])), null, 2)},
  fontSize: ${JSON.stringify(Object.fromEntries(Object.entries(y.typography).map(([k, t]) => [k, [t.fontSize, { lineHeight: `${Math.round(px(t.fontSize) * t.lineHeight)}px`, letterSpacing: t.letterSpacing ?? "0px", fontWeight: String(t.fontWeight) }]])), null, 2)},
  borderRadius: ${JSON.stringify(y.rounded, null, 2)},
  spacing: ${JSON.stringify(y.spacing, null, 2)},
};
`;

let changed = false;
for (const [path, content] of [
  [OUT_TS, ts],
  [OUT_TW, tw],
] as const) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current !== content) {
    changed = true;
    if (check) console.error(`tokens out of date: ${path}`);
    else {
      writeFileSync(path, content);
      console.log(`wrote ${path}`);
    }
  }
}
if (check && changed) {
  console.error("run `bun run tokens` and commit the result");
  process.exit(1);
}
if (check) console.log("tokens up to date");
