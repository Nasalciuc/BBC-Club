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

export const airportsRepo = {
  async get(exec: Executor, code: string) {
    const [row] = await exec.select().from(airports).where(eq(airports.code, code.toUpperCase())).limit(1);
    return row ?? null;
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

  /** Prefix on code/city, then contains; popularity desc; max 8. */
  /**
   * ADR-IMPL-036. Accent-blind and typo-tolerant, in tiers: a country nickname (UK, USA, UAE) means the country first;
   * then exact code, code prefix, exact city, city prefix, country, other names (LON, KIV, New York City), text
   * anywhere, and — from four letters — a close spelling. In the first six tiers the busiest airport leads; in the last
   * two, the closest spelling. The *_norm columns are lower-case and accent-free, kept by the airports_normalize
   * trigger (0023); the typed text is normalised once per query, in scalar subqueries.
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
    // A known country nickname (UK, USA, UAE) means the country — before any code that happens to spell it (USA).
    const tier = sql`CASE
      WHEN ${nickname !== undefined} AND ${ctry} = ${country} THEN -1
      WHEN lower(${airports.code}) = ${raw} THEN 0
      WHEN lower(${airports.code}) LIKE ${like} || '%' THEN 1
      WHEN ${city} = ${t} THEN 2
      WHEN ${city} LIKE ${tl} || '%' THEN 3
      WHEN ${ctry} = ${country} OR (length(${raw}) >= 3 AND ${ctry} LIKE ${countryLike} || '%') THEN 4
      WHEN ${terms} LIKE '%' || ${tl} || '%' THEN 5
      WHEN ${city} LIKE '%' || ${tl} || '%' OR ${name} LIKE '%' || ${tl} || '%' THEN 6
      ELSE 7 END`;
    return (
      exec
        .select()
        .from(airports)
        .where(sql`${tier} < 7 OR ${fuzzy}`)
        // Exact, prefix, country and other-name tiers: the busiest first. Text-anywhere and typo tiers: the closest
        // spelling — similarity is computed only for those rows.
        .orderBy(
          tier,
          sql`CASE WHEN ${tier} < 6 THEN ${airports.popularity} END DESC NULLS LAST`,
          sql`CASE WHEN ${tier} >= 6 THEN similarity(${city}, ${t}) END DESC NULLS LAST`,
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
    }>,
  ) {
    let n = 0;
    for (const row of rows) {
      await exec
        .insert(airports)
        .values(row)
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
          },
        });
      n += 1;
    }
    return n;
  },
};
