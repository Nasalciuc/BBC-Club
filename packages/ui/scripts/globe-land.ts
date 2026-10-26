/**
 * Generates the globe's land data from Natural Earth (via world-atlas; public domain) in three detail levels.
 *   low  — 110m as published                       (fingers on the globe)
 *   mid  — 50m, simplified at 1 px² on a 248 px radius  (idle rotation)
 *   high — 50m, simplified at 0.1 px²               (still, or zoomed in)
 * Simplified levels are re-quantized to 1e5 (0.0036°, 0.016 px at 1×). Deterministic: same inputs, same bytes.
 *   bun packages/ui/scripts/globe-land.ts          write the three files
 *   bun packages/ui/scripts/globe-land.ts --check  exit 1 if the committed files differ
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { quantize } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import type { Topology } from "topojson-specification";

const OUT = join(import.meta.dir, "..", "src", "globe", "land");
const RADIUS = 248; // Figma: the sphere's radius in the 520 px frame
const PX_AREA = (180 / Math.PI / RADIUS) ** 2; // one screen pixel, in square degrees, at the globe's centre

function load(name: string): Topology {
  return JSON.parse(readFileSync(require.resolve(`world-atlas/${name}.json`), "utf8")) as Topology;
}

export function build(): Record<"low" | "mid" | "high", string> {
  const pre = presimplify(load("land-50m") as never);
  return {
    low: JSON.stringify(load("land-110m")),
    mid: JSON.stringify(quantize(simplify(pre, PX_AREA * 1) as never, 1e5)),
    high: JSON.stringify(quantize(simplify(pre, PX_AREA * 0.1) as never, 1e5)),
  };
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [level, json] of Object.entries(build())) {
    const file = join(OUT, `land-${level}.json`);
    if (check) {
      let current = "";
      try {
        current = readFileSync(file, "utf8");
      } catch {
        /* missing counts as stale */
      }
      if (current !== json) {
        console.error(`❌ ${file} is stale — run: bun packages/ui/scripts/globe-land.ts`);
        stale++;
      }
    } else {
      writeFileSync(file, json);
      console.log(`✅ ${file} · ${(json.length / 1024).toFixed(0)} KB`);
    }
  }
  if (check && stale === 0) console.log("✅ globe land data is current");
  process.exit(stale ? 1 : 0);
}
