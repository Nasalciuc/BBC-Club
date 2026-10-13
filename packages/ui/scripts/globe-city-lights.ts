/**
 * Generates the globe's city lights from Natural Earth's populated places (public domain), release v5.1.2 — pinned by
 * tag and by hash, so the data never moves under the app:
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson
 *   sha256 fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f
 * Every place of 100,000 people or more (`pop_max`), as [longitude, latitude, log10(pop_max / 100,000)] with two
 * decimals (about a kilometre), largest first. Deterministic: the same file gives the same bytes.
 *   bun packages/ui/scripts/globe-city-lights.ts                  download the pinned file, check its hash, write
 *   bun packages/ui/scripts/globe-city-lights.ts --source <file>  the same, from the file already on disk
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson";
const SHA256 = "fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f";
const MIN_POPULATION = 100_000;
const OUT = join(import.meta.dir, "..", "src", "globe", "city-lights", "places.json");

type Place = {
  type: "Feature";
  geometry: { coordinates: [number, number] };
  properties: { name?: string; pop_max?: number };
};

const two = (v: number) => Math.round(v * 100) / 100;
/** By UTF-16 code unit, never by locale: the same order on every machine, so the same bytes. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function download(): Promise<string> {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${URL}`);
  return res.text();
}

export function build(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== SHA256) throw new Error(`the populated places are not v5.1.2 (sha256 ${hash})`);
  const places = (JSON.parse(source) as { features: Place[] }).features
    .filter((f) => (f.properties.pop_max ?? 0) >= MIN_POPULATION)
    .map((f) => ({
      name: f.properties.name ?? "",
      pop: f.properties.pop_max ?? 0,
      lng: two(f.geometry.coordinates[0]),
      lat: two(f.geometry.coordinates[1]),
    }))
    .sort((a, b) => b.pop - a.pop || byCodeUnit(a.name, b.name) || a.lng - b.lng || a.lat - b.lat)
    .map((p) => [p.lng, p.lat, two(Math.log10(p.pop / MIN_POPULATION))]);
  return JSON.stringify({
    source: "Natural Earth v5.1.2, ne_10m_populated_places_simple (public domain)",
    minPopulation: MIN_POPULATION,
    places,
  });
}

if (import.meta.main) {
  const at = process.argv.indexOf("--source");
  const source = at > 0 ? readFileSync(process.argv[at + 1]!, "utf8") : await download();
  const json = build(source);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`✅ ${OUT} · ${(json.length / 1024).toFixed(0)} KB`);
}
