/**
 * The reference airports (ADR-IMPL-036): every airport with scheduled service and an IATA code, so a member can find
 * any city. Loaded by migrate.ts on every deploy, insert-only — a row that exists (the curated seed, the company's
 * catalogue import) is never touched. Sources and licences: seeds/NOTICE.md.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";

import { airports } from "../src/schema/catalog";

export const REFERENCE_TSV = join(dirname(fileURLToPath(import.meta.url)), "../seeds/airports-reference.tsv");
const HEADER = "code\tname\tcity\tcountry\tcountry_code\tregion\tlat\tlng\tpopularity\ttz\tsearch_terms";

export type ReferenceAirport = typeof airports.$inferInsert;

/** Tab-separated, one airport per line; no field contains a tab. Never trims a line's end: a tab is whitespace, and
 *  the last field (search_terms) may be empty. Tolerates Windows line endings (a checkout with core.autocrlf). */
export function parseReference(text: string): ReferenceAirport[] {
  const all = text.split("\n").map((l) => l.replace(/\r$/, ""));
  while (all.length && all.at(-1) === "") all.pop();
  const [header, ...lines] = all;
  if (header !== HEADER) throw new Error("airports-reference.tsv: unexpected header");
  return lines.map((line, i) => {
    const f = line.split("\t");
    if (f.length !== 11) throw new Error(`airports-reference.tsv: line ${i + 2} has ${f.length} fields`);
    const [code, name, city, country, countryCode, region, lat, lng, popularity, tz, searchTerms] = f as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      code,
      name,
      city,
      country,
      countryCode,
      region,
      lat,
      lng,
      popularity: Number(popularity),
      tz,
      searchTerms: searchTerms || null,
    };
  });
}

type Inserter = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
  insert: (t: typeof airports) => {
    values: (rows: ReferenceAirport[]) => {
      onConflictDoNothing: (o: { target: typeof airports.code }) => {
        returning: (r: { code: typeof airports.code }) => Promise<{ code: string }[]>;
      };
    };
  };
};

/**
 * Inserts the airports that are missing, 500 per statement, and fills `search_terms` where an existing row has none —
 * the curated seed and the catalogue import never set it, so without this "Tokyo" would not find an imported Narita.
 * Nothing else on an existing row is touched. Returns how many airports were new.
 */
export async function loadAirportsReference(db: Inserter, text = readFileSync(REFERENCE_TSV, "utf8")): Promise<number> {
  const rows = parseReference(text);
  const withTerms = rows.filter((r) => r.searchTerms);
  for (let i = 0; i < withTerms.length; i += 500) {
    const values = sql.join(
      withTerms.slice(i, i + 500).map((r) => sql`(${r.code}, ${r.searchTerms})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE catalog.airports AS a SET search_terms = v.terms
      FROM (VALUES ${values}) AS v(code, terms)
      WHERE a.code = v.code AND a.search_terms IS NULL`);
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await db
      .insert(airports)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing({ target: airports.code })
      .returning({ code: airports.code });
    added += inserted.length;
  }
  return added;
}
