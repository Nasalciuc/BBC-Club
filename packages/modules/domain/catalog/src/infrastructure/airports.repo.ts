import type { Executor } from "@bbc/db";
import { asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { airports } from "@bbc/db/schema/catalog";

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
  async search(exec: Executor, q: string) {
    const term = q.trim();
    if (!term) return [];
    const prefix = `${term}%`;
    const contains = `%${term}%`;
    return exec
      .select()
      .from(airports)
      .where(or(ilike(airports.code, prefix), ilike(airports.city, contains), ilike(airports.name, contains)))
      .orderBy(
        sql`CASE WHEN ${airports.code} ILIKE ${prefix} THEN 0 WHEN ${airports.city} ILIKE ${prefix} THEN 1 ELSE 2 END`,
        desc(airports.popularity),
        asc(airports.code),
      )
      .limit(8);
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
          },
        });
      n += 1;
    }
    return n;
  },
};
