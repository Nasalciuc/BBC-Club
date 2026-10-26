/**
 * The reference airports (ADR-IMPL-036): every airport with scheduled service and an IATA code, so a member can find
 * any city. Loaded by migrate.ts on every deploy, insert-only — a row that exists (the curated seed, the company's
 * catalogue import) is never touched, except to correct a city the reference itself got wrong, and only while the row
 * is still exactly what the reference inserted (ADR-IMPL-038). Sources and licences: seeds/NOTICE.md.
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

export const FIXES_TSV = join(dirname(fileURLToPath(import.meta.url)), "../seeds/airports-reference-fixes.tsv");
const FIXES_HEADER = "code\tfrom\tto\treason\tsearchable";
export const FIX_REASONS = [
  "accents",
  "spelling",
  "suffix",
  "served",
  "island",
  "renamed",
  "english",
  "curated",
] as const;

/** One corrected city (ADR-IMPL-038): `from` is the reference's earlier value, `to` the one the TSV now holds. */
export type ReferenceFix = {
  code: string;
  from: string;
  to: string;
  reason: (typeof FIX_REASONS)[number];
  /** Old or local names kept searchable — the TSV's search_terms end with them. */
  searchable: string[];
};

export function parseFixes(text: string): ReferenceFix[] {
  const all = text.split("\n").map((l) => l.replace(/\r$/, ""));
  while (all.length && all.at(-1) === "") all.pop();
  const [header, ...lines] = all;
  if (header !== FIXES_HEADER) throw new Error("airports-reference-fixes.tsv: unexpected header");
  return lines.map((line, i) => {
    const f = line.split("\t");
    if (f.length !== 5) throw new Error(`airports-reference-fixes.tsv: line ${i + 2} has ${f.length} fields`);
    const [code, from, to, reason, searchable] = f as [string, string, string, string, string];
    if (!(FIX_REASONS as readonly string[]).includes(reason)) {
      throw new Error(`airports-reference-fixes.tsv: line ${i + 2} has an unknown reason`);
    }
    return {
      code,
      from,
      to,
      reason: reason as ReferenceFix["reason"],
      searchable: searchable ? searchable.split(" | ") : [],
    };
  });
}

/**
 * Brings existing rows up to the corrected reference (ADR-IMPL-038). The city changes only on a row that is still
 * exactly what the reference loader inserted — the old city, the reference's name and coordinates — so the curated seed
 * and the catalogue import, which write their own, keep theirs. Search terms always come from the reference (neither
 * writes them): they become the reference's while they are still its earlier ones, which the new ones extend; terms
 * someone changed stay. Idempotent. Returns how many rows changed.
 */
export async function applyReferenceFixes(
  db: Pick<Inserter, "execute">,
  text = readFileSync(REFERENCE_TSV, "utf8"),
  fixesText = readFileSync(FIXES_TSV, "utf8"),
): Promise<number> {
  const reference = new Map(parseReference(text).map((r) => [r.code, r]));
  const fixes = parseFixes(fixesText);
  let corrected = 0;
  for (let i = 0; i < fixes.length; i += 500) {
    const values = sql.join(
      fixes.slice(i, i + 500).map((f) => {
        const r = reference.get(f.code);
        if (!r) throw new Error(`airports-reference-fixes.tsv: ${f.code} is not in the reference`);
        return sql`(${f.code}::text, ${f.from}::text, ${f.to}::text, ${r.name}::text, ${r.lat}::numeric, ${r.lng}::numeric, ${r.searchTerms ?? null}::text)`;
      }),
      sql`, `,
    );
    const rows = (await db.execute(sql`
      UPDATE catalog.airports AS a
      SET city = CASE WHEN v.inserted THEN v.to_city ELSE a.city END,
          search_terms = CASE WHEN a.search_terms IS NULL OR v.extends THEN v.terms ELSE a.search_terms END
      FROM (
        SELECT f.*, (b.city = f.from_city AND b.name = f.name AND b.lat = f.lat AND b.lng = f.lng) AS inserted,
               coalesce(left(f.terms, length(b.search_terms) + 3) = b.search_terms || ' | ', false) AS extends
        FROM (VALUES ${values}) AS f(code, from_city, to_city, name, lat, lng, terms)
        JOIN catalog.airports AS b ON b.code = f.code
      ) AS v
      WHERE a.code = v.code AND (v.inserted OR v.extends)
      RETURNING a.code`)) as unknown as { code: string }[];
    corrected += rows.length;
  }
  return corrected;
}
