import { z } from "zod";
import { withTx, type Db } from "@bbc/db";
import { airportsRepo } from "../infrastructure/airports.repo";
import { faresRepo } from "../infrastructure/fares.repo";

const FareCsvRow = z.object({
  route_from: z.string().length(3),
  route_to: z.string().length(3),
  cabin: z.enum(["business", "first"]),
  carrier: z.string().length(2).nullable().optional(),
  carrier_name: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  nonstop: z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? true : v === "true" || v === "1")),
  duration_minutes: z
    .string()
    .optional()
    .transform((v) => (v && v.length ? Number(v) : null)),
  price: z.string().min(1),
  published_price: z.string().optional().nullable(),
  published_source: z.string().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
});

const AirportCsvRow = z.object({
  code: z.string().length(3),
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  country_code: z.string().length(2),
  region: z.string().min(1),
  lat: z.string().min(1),
  lng: z.string().min(1),
  popularity: z
    .string()
    .optional()
    .transform((v) => (v && v.length ? Number(v) : 0)),
});

function parseCsv(raw: string): string[][] {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return lines.map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    return cols.map((c) => c.trim());
  });
}

function rowsFromCsv(raw: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(raw);
  if (!header) return [];
  return body.map((cols) => Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""])));
}

export const ImportBody = z.object({
  kind: z.enum(["fares", "airports"]),
  csv: z.string().min(1),
});
export type ImportBody = z.infer<typeof ImportBody>;

export async function importCatalog(deps: { db: Db }, input: ImportBody): Promise<{ imported: number }> {
  return withTx(deps.db, async (tx) => {
    if (input.kind === "airports") {
      const rows = rowsFromCsv(input.csv).map((r) => AirportCsvRow.parse(r));
      const n = await airportsRepo.upsertMany(
        tx,
        rows.map((r) => ({
          code: r.code.toUpperCase(),
          name: r.name,
          city: r.city,
          country: r.country,
          countryCode: r.country_code.toUpperCase(),
          region: r.region,
          lat: r.lat,
          lng: r.lng,
          popularity: r.popularity,
        })),
      );
      return { imported: n };
    }

    const rows = rowsFromCsv(input.csv).map((r) => FareCsvRow.parse(r));
    let n = 0;
    for (const r of rows) {
      const publishedPrice = r.published_price && r.published_price.length ? r.published_price : null;
      const publishedSource = r.published_source && r.published_source.length ? r.published_source : null;
      if (publishedPrice && !publishedSource) {
        throw new Error("published_price requires published_source");
      }
      await faresRepo.upsertImport(tx, {
        routeFrom: r.route_from.toUpperCase(),
        routeTo: r.route_to.toUpperCase(),
        cabin: r.cabin,
        carrier: r.carrier?.toUpperCase() ?? null,
        carrierName: r.carrier_name ?? null,
        product: r.product ?? null,
        nonstop: r.nonstop,
        durationMinutes: r.duration_minutes,
        price: r.price,
        publishedPrice,
        publishedSource,
        currency: r.currency.toUpperCase(),
        validFrom: new Date(r.valid_from),
        validUntil: new Date(r.valid_until),
      });
      n += 1;
    }
    return { imported: n };
  });
}
