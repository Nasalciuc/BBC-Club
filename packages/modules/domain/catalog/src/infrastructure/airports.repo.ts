import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { airports } from "@bbc/db/schema/catalog";

/** The same table again, for the typo tier's candidate subquery (its trigram indexes pick them). */
const candidates = alias(airports, "candidates");

/** What members type for a country, mapped to the reference data's name. Lower case, accents kept out. */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  uk: "united kingdom",
  gb: "united kingdom",
  britain: "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  usa: "united states",
  us: "united states",
  america: "united states",
  uae: "united arab emirates",
  emirates: "united arab emirates",
  holland: "netherlands",
  korea: "south korea",
  czechia: "czech republic",
  turkiye: "turkey",
};

/**
 * The spellings one swap of two neighbouring letters away (`pairs` → `apirs`, `piars`, `paris`, `paisr`): a short
 * city typed with two letters crossed falls under the trigram tier's threshold. Only for a query of letters and
 * spaces, four letters or more, and only swaps of two different letters.
 */
export function adjacentSwaps(q: string): string[] {
  const letters = q.replace(/ /g, "");
  if (!/^[\p{L} ]+$/u.test(q) || [...letters].length < 4) return [];
  const chars = [...q];
  const out = new Set<string>();
  for (let i = 0; i + 1 < chars.length; i++) {
    const a = chars[i];
    const b = chars[i + 1];
    if (a === undefined || b === undefined || a === b || a === " " || b === " ") continue;
    const swapped = [...chars];
    swapped[i] = b;
    swapped[i + 1] = a;
    out.add(swapped.join(""));
  }
  out.delete(q);
  return [...out];
}

export const airportsRepo = {
  async get(exec: Executor, code: string) {
    const [row] = await exec.select().from(airports).where(eq(airports.code, code.toUpperCase())).limit(1);
    return row ?? null;
  },

  /** The regions the catalogue uses (Home's carousel keys: `europe`, `middle_east`…). */
  async regions(exec: Executor): Promise<string[]> {
    const rows = await exec.selectDistinct({ region: airports.region }).from(airports);
    return rows.map((r) => r.region);
  },

  async getMany(exec: Executor, codes: string[]) {
    if (codes.length === 0) return [];
    return exec
      .select()
      .from(airports)
      .where(
        inArray(
          airports.code,
          codes.map((c) => c.toUpperCase()),
        ),
      );
  },

  /** Prefix on code/city, then contains; the busiest city first, its airports together; max 8. */
  /**
   * ADR-IMPL-036. Accent-blind and typo-tolerant, in tiers: a country nickname (UK, USA, UAE) means the country first;
   * then exact code, code prefix, exact city, city prefix, country, other names (LON, KIV, New York City), a city
   * spelled with two neighbouring letters swapped (from four letters: `Pairs`, `Toyko`, `Lodnon`), text anywhere, and
   * — from four letters — a close spelling. Up to the swapped city the busiest airport leads; in the last two tiers,
   * the closest spelling. The *_norm columns are lower-case and accent-free, kept by the airports_normalize trigger
   * (0023); the typed text is normalised once per query, in scalar subqueries.
   */
  async search(exec: Executor, q: string) {
    const raw = q.trim().toLowerCase();
    if (!raw) return [];
    // LIKE treats % and _ as wildcards and \ as an escape: what the member typed is matched literally.
    const like = raw.replace(/[\\%_]/g, (c) => `\\${c}`);
    const nickname = COUNTRY_ALIASES[raw];
    const t = sql`(SELECT unaccent(${raw}))`;
    const tl = sql`(SELECT unaccent(${like}))`;
    const country = sql`(SELECT unaccent(${nickname ?? raw}))`;
    const countryLike = sql`(SELECT unaccent(${nickname ?? like}))`;
    const city = airports.cityNorm;
    const name = airports.nameNorm;
    const ctry = airports.countryNorm;
    const terms = airports.termsNorm;
    // Close spellings, from four letters. The trigram indexes pick the candidates (pg_trgm's % and <% operators, at the
    // extension's default thresholds); the exact similarity is computed only for them, not for every airport.
    const fuzzy =
      raw.length >= 4
        ? inArray(
            airports.code,
            exec
              .select({ code: candidates.code })
              .from(candidates)
              .where(
                or(
                  and(sql`${candidates.cityNorm} % ${t}`, sql`similarity(${candidates.cityNorm}, ${t}) > 0.35`),
                  sql`${t} <% ${candidates.nameNorm}`,
                ),
              ),
          )
        : sql`false`;
    // Two neighbouring letters swapped, from four letters: the city itself or its start (a prefix pattern matches
    // both), for any one swap. The variants are letters and spaces only (adjacentSwaps), so LIKE reads them literally;
    // unaccent as the typed text. The patterns are built once per query (an uncorrelated ARRAY(...) is an InitPlan),
    // never per airport: unaccenting them row by row made a long query thirty times slower on every keystroke.
    const swaps = adjacentSwaps(raw);
    const swapped =
      swaps.length > 0
        ? sql`${city} LIKE ANY (ARRAY(SELECT unaccent(v.s) || '%' FROM unnest(ARRAY[${sql.join(
            swaps.map((s) => sql`${s}`),
            sql`, `,
          )}]::text[]) AS v(s)))`
        : sql`false`;
    // A known country nickname (UK, USA, UAE) means the country — before any code that happens to spell it (USA).
    const tier = sql`CASE
      WHEN ${nickname !== undefined} AND ${ctry} = ${country} THEN -1
      WHEN lower(${airports.code}) = ${raw} THEN 0
      WHEN lower(${airports.code}) LIKE ${like} || '%' THEN 1
      WHEN ${city} = ${t} THEN 2
      WHEN ${city} LIKE ${tl} || '%' THEN 3
      WHEN ${ctry} = ${country} OR (length(${raw}) >= 3 AND ${ctry} LIKE ${countryLike} || '%') THEN 4
      WHEN ${terms} LIKE '%' || ${tl} || '%' THEN 5
      WHEN ${swapped} THEN 6
      WHEN ${city} LIKE '%' || ${tl} || '%' OR ${name} LIKE '%' || ${tl} || '%' THEN 7
      ELSE 8 END`;
    return (
      exec
        .select()
        .from(airports)
        .where(sql`${tier} < 8 OR ${fuzzy}`)
        // Exact, prefix, country, other-name and swapped-letters tiers: the busiest city first with its airports
        // together (`Lon`: London's five before Long Beach — 18), each city's busiest first. A city's weight counts only
        // its airports in the same tier: `L` leads with London's, not with LaGuardia lifted by JFK's looser match.
        // Text-anywhere and typo tiers: the closest spelling — similarity is computed only for those rows.
        .orderBy(
          tier,
          sql`CASE WHEN ${tier} < 7 THEN max(${airports.popularity}) OVER (PARTITION BY ${tier}, ${city}, ${airports.countryCode}) END DESC NULLS LAST`,
          sql`CASE WHEN ${tier} < 7 THEN ${city} END`,
          sql`CASE WHEN ${tier} < 7 THEN ${airports.popularity} END DESC NULLS LAST`,
          sql`CASE WHEN ${tier} >= 7 THEN similarity(${city}, ${t}) END DESC NULLS LAST`,
          desc(airports.popularity),
          asc(airports.code),
        )
        .limit(8)
    );
  },

  async upsertMany(
    exec: Executor,
    rows: Array<{
      code: string;
      name: string;
      city: string;
      country: string;
      countryCode: string;
      region: string;
      lat: string;
      lng: string;
      popularity: number;
      tz: string;
      /** The destination's one line (ADR-IMPL-056): a line, null to clear it, or undefined — the import had no such
       *  column — to keep what the airport has. */
      description?: string | null;
    }>,
  ) {
    let n = 0;
    for (const { description, ...row } of rows) {
      const line = description === undefined ? {} : { description };
      await exec
        .insert(airports)
        .values({ ...row, ...line })
        .onConflictDoUpdate({
          target: airports.code,
          set: {
            name: row.name,
            city: row.city,
            country: row.country,
            countryCode: row.countryCode,
            region: row.region,
            lat: row.lat,
            lng: row.lng,
            popularity: row.popularity,
            tz: row.tz,
            ...line,
          },
        });
      n += 1;
    }
    return n;
  },
};
