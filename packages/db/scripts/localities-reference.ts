/**
 * The towns and cities a tap on the globe is named by (ADR-IMPL-083): GeoNames' populated places of 5,000 people or
 * more. Loaded by migrate.ts on every deploy. The file owns the table: nothing else writes it, so a row the file
 * changed takes the file's values. A table that already holds as many rows as the file is left as it is — the load is
 * skipped and a deploy pays one count — so a correction that keeps the count lands with `force`
 * (`bun run db:migrate -- --localities`).
 * Rows are never deleted. Sources and licence: seeds/NOTICE.md.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";

export const LOCALITIES_TSV = join(dirname(fileURLToPath(import.meta.url)), "../seeds/localities-reference.tsv");
const HEADER = "id\tname\tcountry_code\tlat\tlng\tpopulation";

export type ReferenceLocality = {
  id: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  population: number;
};

/** Tab-separated, one place per line; no field holds a tab. Tolerates Windows line endings. */
export function parseLocalities(text: string): ReferenceLocality[] {
  const all = text.split("\n").map((l) => l.replace(/\r$/, ""));
  while (all.length && all.at(-1) === "") all.pop();
  const [header, ...lines] = all;
  if (header !== HEADER) throw new Error("localities-reference.tsv: unexpected header");
  return lines.map((line, i) => {
    const f = line.split("\t");
    if (f.length !== 6) throw new Error(`localities-reference.tsv: line ${i + 2} has ${f.length} fields`);
    const [id, name, countryCode, lat, lng, population] = f as [string, string, string, string, string, string];
    return {
      id: Number(id),
      name,
      countryCode,
      lat: Number(lat),
      lng: Number(lng),
      population: Number(population),
    };
  });
}

type Executor = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * Writes the file's places, 500 per statement: new ones inserted, changed ones updated, the same ones untouched. Skipped
 * when the table already holds as many rows as the file, unless `force`. Returns how many rows were written.
 */
export async function loadLocalitiesReference(
  db: Executor,
  text = readFileSync(LOCALITIES_TSV, "utf8"),
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  const rows = parseLocalities(text);
  const [held] = (await db.execute(sql`SELECT count(*)::int AS n FROM catalog.localities`)) as unknown as {
    n: number;
  }[];
  if (!force && held?.n === rows.length) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const values = sql.join(
      rows
        .slice(i, i + 500)
        .map((r) => sql`(${r.id}, ${r.name}, ${r.countryCode}, ${r.lat}::float8, ${r.lng}::float8, ${r.population})`),
      sql`, `,
    );
    const changed = (await db.execute(sql`
      INSERT INTO catalog.localities (id, name, country_code, lat, lng, population)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        country_code = excluded.country_code,
        lat = excluded.lat,
        lng = excluded.lng,
        population = excluded.population
      WHERE (catalog.localities.name, catalog.localities.country_code, catalog.localities.lat, catalog.localities.lng,
             catalog.localities.population)
        IS DISTINCT FROM (excluded.name, excluded.country_code, excluded.lat, excluded.lng, excluded.population)
      RETURNING 1`)) as unknown as unknown[];
    written += changed.length;
  }
  return written;
}
