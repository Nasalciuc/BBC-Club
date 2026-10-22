import { z } from "zod";
import { withTx, type Db } from "@bbc/db";
import { airportsRepo } from "../infrastructure/airports.repo";
import { faresRepo } from "../infrastructure/fares.repo";
import { assertIanaZone } from "./flight-local";

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
  /** What the price is for (ADR-IMPL-056): `round_trip` or `one_way`; a file without the column, or an empty cell, says
   *  one way — a fare says round trip only where the catalogue says so. Anything else refuses the import. */
  trip: z.preprocess((v) => (v == null || v === "" ? "one_way" : v), z.enum(["round_trip", "one_way"])),
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
  tz: z.string().min(1),
  /** The destination's one line under its city (ADR-IMPL-056), at most 160 characters — quoted when it has a comma. An
   *  empty cell clears it; a file without the column leaves every airport's as it is. */
  description: z
    .string()
    .max(160)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.trim() || null)),
});

/** A file the reader cannot read, at the line its record starts on (the header is line 1). */
export class CsvError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
    this.name = "CsvError";
  }
}

/**
 * RFC 4180 over the whole file: a quoted cell may hold commas, line breaks (CRLF, LF or CR) and quotes, written
 * twice (`""`). Unquoted cells are trimmed; quoted ones are kept as written. Blank lines, the empty lines at the end
 * and a byte-order mark are ignored. Each record carries the file line it starts on. A quote left open, or text after
 * a closing quote, is a CsvError.
 */
export function parseCsv(raw: string): { line: number; cells: string[] }[] {
  const src = raw.startsWith("﻿") ? raw.slice(1) : raw;
  const records: { line: number; cells: string[] }[] = [];
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const start = line;
    const cells: string[] = [];
    let quotedAny = false;
    // One record: cells until an unquoted line end or the end of the file.
    for (;;) {
      let cell = "";
      let quoted = false;
      // Spaces before an opening quote are not part of the cell.
      let j = i;
      while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
      if (src[j] === '"') {
        quoted = true;
        quotedAny = true;
        i = j + 1;
        for (;;) {
          if (i >= src.length) throw new CsvError(start, `row ${start}: a quoted cell is not closed`);
          const ch = src[i];
          if (ch === '"') {
            if (src[i + 1] === '"') {
              cell += '"';
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          if (ch === "\r" || ch === "\n") {
            // A line break inside quotes is the cell's; CRLF counts as one line.
            if (ch === "\r" && src[i + 1] === "\n") {
              cell += "\r\n";
              i += 2;
            } else {
              cell += ch;
              i += 1;
            }
            line += 1;
            continue;
          }
          cell += ch;
          i += 1;
        }
        while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
        if (i < src.length && src[i] !== "," && src[i] !== "\r" && src[i] !== "\n") {
          throw new CsvError(start, `row ${start}: text after a closing quote`);
        }
      } else {
        while (i < src.length && src[i] !== "," && src[i] !== "\r" && src[i] !== "\n") {
          cell += src[i];
          i += 1;
        }
      }
      cells.push(quoted ? cell : cell.trim());
      if (i < src.length && src[i] === ",") {
        i += 1;
        continue;
      }
      // A line end (CRLF, LF or CR) or the end of the file closes the record.
      if (src[i] === "\r" && src[i + 1] === "\n") i += 2;
      else if (i < src.length) i += 1;
      if (i <= src.length) line += 1;
      break;
    }
    // A blank line is no record.
    if (!quotedAny && cells.length === 1 && cells[0] === "") continue;
    records.push({ line: start, cells });
  }
  return records;
}

/** The records after the header, each value named by its column, with the line the record starts on. A record with
 *  more cells than the header is refused (a comma left unquoted); a shorter one leaves its last values empty. */
export function rowsFromCsv(raw: string): { line: number; values: Record<string, string> }[] {
  const [header, ...body] = parseCsv(raw);
  if (!header) return [];
  return body.map(({ line, cells }) => {
    if (cells.length > header.cells.length) {
      throw new CsvError(line, `row ${line}: ${cells.length} cells, the header has ${header.cells.length}`);
    }
    return { line, values: Object.fromEntries(header.cells.map((h, i) => [h, cells[i] ?? ""])) };
  });
}

export const ImportBody = z.object({
  kind: z.enum(["fares", "airports"]),
  csv: z.string().min(1),
});
export type ImportBody = z.infer<typeof ImportBody>;

export async function importCatalog(deps: { db: Db }, input: ImportBody): Promise<{ imported: number }> {
  return withTx(deps.db, async (tx) => {
    if (input.kind === "airports") {
      const rows = rowsFromCsv(input.csv).map((r) => AirportCsvRow.parse(r.values));
      for (const r of rows) assertIanaZone(r.tz);
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
          tz: r.tz,
          description: r.description,
        })),
      );
      return { imported: n };
    }

    const rows = rowsFromCsv(input.csv).map((r) => FareCsvRow.parse(r.values));
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
        trip: r.trip,
        validFrom: new Date(r.valid_from),
        validUntil: new Date(r.valid_until),
      });
      n += 1;
    }
    return { imported: n };
  });
}
