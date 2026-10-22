import { z } from "zod";
import { errorForLog, withTx, type Db, type Executor } from "@bbc/db";
import { airportsRepo } from "../infrastructure/airports.repo";
import { faresRepo } from "../infrastructure/fares.repo";
import { isIanaZone } from "./flight-local";

/** An empty cell of an optional column is no value. */
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
/** Optional text: an empty cell, or no such column, is none. */
const OptionalText = z.preprocess(blankToNull, z.string().nullable().optional());
/** An IATA airport code — what Popular, place photos and the CHECKs accept — upper-cased. */
const Iata = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "three letters (an IATA code)")
  .transform((v) => v.toUpperCase());
/** An amount fares.price (numeric(10,2)) holds as written: digits, at most two decimals, above zero. `1e3` and
 *  `99.999` were stored as 1000 and 100. */
const Amount = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "an amount: digits, at most two decimals")
  .refine((v) => Number(v) > 0, "must be above 0");
/** A coordinate in degrees, as numeric(9,6) holds it, within ±max. */
const Degrees = (max: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d+)?$/, "a number of degrees")
    .refine((v) => Math.abs(Number(v)) <= max, `from -${max} to ${max}`);

const YES = new Set(["true", "yes", "y", "1"]);
const NO = new Set(["false", "no", "n", "0"]);

const FareCsvRow = z
  .object({
    route_from: Iata,
    route_to: Iata,
    cabin: z.enum(["business", "first"]),
    /** The airline's IATA code, upper-cased; an empty cell, or no such column, is none — still one fare (0034). */
    carrier: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(/^[A-Za-z0-9]{2}$/, "two letters or digits (an IATA airline code)")
        .transform((v) => v.toUpperCase())
        .nullable()
        .optional(),
    ),
    carrier_name: OptionalText,
    product: OptionalText,
    /** Yes or no, as a spreadsheet or a person writes it (TRUE, yes, y, 1 / FALSE, no, n, 0), any case; an empty cell
     *  or no such column is nonstop. Anything else is refused: it used to mean Connecting, silently. */
    nonstop: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const s = (v ?? "").trim().toLowerCase();
        if (s === "" || YES.has(s)) return true;
        if (NO.has(s)) return false;
        ctx.addIssue({ code: "custom", message: "yes or no (true/false, yes/no, y/n, 1/0)" });
        return z.NEVER;
      }),
    /** Whole minutes above zero (FareVM's rule: a fare at 0 made the route's whole search fail to parse in the app);
     *  an empty cell, or no such column, is none. Five digits at most: an integer column, and no flight is longer. */
    duration_minutes: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(/^\d{1,5}$/, "whole minutes")
        .refine((v) => Number(v) > 0, "must be above 0")
        .transform(Number)
        .nullable()
        .optional(),
    ),
    price: Amount,
    published_price: z.preprocess(blankToNull, Amount.nullable().optional()),
    published_source: OptionalText,
    /** ISO 4217, upper-cased; a file without the column, or an empty cell, is USD. */
    currency: z.preprocess(
      (v) => (v == null || v === "" ? "USD" : v),
      z
        .string()
        .regex(/^[A-Za-z]{3}$/, "a three-letter currency code")
        .transform((v) => v.toUpperCase()),
    ),
    /** What the price is for (ADR-IMPL-056): `round_trip` or `one_way`; a file without the column, or an empty cell, says
     *  one way — a fare says round trip only where the catalogue says so. Anything else refuses the import. */
    trip: z.preprocess((v) => (v == null || v === "" ? "one_way" : v), z.enum(["round_trip", "one_way"])),
    valid_from: z.string().datetime(),
    valid_until: z.string().datetime(),
  })
  .superRefine((r, ctx) => {
    // The fares CHECKs, so the row is named instead of a query refused.
    if (r.route_from === r.route_to) {
      ctx.addIssue({ code: "custom", path: ["route_to"], message: "the same airport as route_from" });
    }
    if (r.published_price != null && Number(r.published_price) < Number(r.price)) {
      ctx.addIssue({ code: "custom", path: ["published_price"], message: "below the price" });
    }
    if (r.published_price != null && r.published_source == null) {
      ctx.addIssue({ code: "custom", path: ["published_source"], message: "required with a published price" });
    }
    if (Date.parse(r.valid_until) <= Date.parse(r.valid_from)) {
      ctx.addIssue({ code: "custom", path: ["valid_until"], message: "must be after valid_from" });
    }
  });

const AirportCsvRow = z.object({
  code: Iata,
  name: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  country_code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "two letters (ISO 3166)")
    .transform((v) => v.toUpperCase()),
  /** One of the regions the catalogue already uses (checked against the table): Home's carousels read these keys. */
  region: z.string().min(1),
  lat: Degrees(90),
  lng: Degrees(180),
  /** A whole number from 0; an empty cell, or no such column, is 0. */
  popularity: z.preprocess(
    (v) => (v == null || v === "" ? "0" : v),
    z
      .string()
      .regex(/^\d{1,6}$/, "a whole number from 0")
      .transform(Number),
  ),
  tz: z.string().refine(isIanaZone, "not an IANA time zone"),
  /** The destination's one line under its city (ADR-IMPL-056), at most 160 characters — quoted when it has a comma. An
   *  empty cell clears it; a file without the column leaves every airport's as it is. */
  description: z
    .string()
    .max(160)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.trim() || null)),
});

/** Home's region keys (SECTION_ORDER and the reference airports): allowed even before the table holds one of them. */
const REGIONS = ["africa", "americas", "asia", "europe", "middle_east", "oceania"];
/** How many rows a refusal names at most. */
const MAX_DETAILS = 20;

/** A file refused: what is wrong, row by row — `row N.<field>`, N the file line its record starts on (header 1). */
export class ImportError extends Error {
  constructor(readonly details: { path: string; message: string }[]) {
    super(details.map((d) => `${d.path}: ${d.message}`).join("; "));
    this.name = "ImportError";
  }
}

/** Every row checked before anything is written; each problem named by its row and field. */
function parseRows<T extends z.ZodTypeAny>(schema: T, raw: string): { line: number; row: z.output<T> }[] {
  let records: { line: number; values: Record<string, string> }[];
  try {
    records = rowsFromCsv(raw);
  } catch (e) {
    if (e instanceof CsvError) throw new ImportError([{ path: `row ${e.line}`, message: e.message }]);
    throw e;
  }
  const details: { path: string; message: string }[] = [];
  const rows: { line: number; row: z.output<T> }[] = [];
  for (const { line, values } of records) {
    const parsed = schema.safeParse(values);
    if (parsed.success) rows.push({ line, row: parsed.data });
    else
      for (const issue of parsed.error.issues) {
        details.push({ path: [`row ${line}`, ...issue.path].join("."), message: issue.message });
      }
  }
  if (details.length > 0) throw new ImportError(details.slice(0, MAX_DETAILS));
  return rows;
}

/** A row the database refuses all the same (a rule the schema above does not mirror): named by its line, with the
 *  constraint — never the query or its values. */
async function writeRow<T>(line: number, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    const err = errorForLog(e);
    if (err.sqlstate === undefined) throw e;
    const why = err.constraint ?? err.sqlstate;
    throw new ImportError([{ path: `row ${line}`, message: `the database refused it (${why})` }]);
  }
}

async function knownAirports(tx: Executor, codes: string[]): Promise<Set<string>> {
  const rows = await airportsRepo.getMany(tx, [...new Set(codes)]);
  return new Set(rows.map((a) => a.code.trim()));
}

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

/**
 * Imports a catalogue file in one transaction: every row is checked first, and a file with any bad row writes nothing
 * — an ImportError names up to twenty, `row N.<field>`. A row the database still refuses is named the same way.
 */
export async function importCatalog(deps: { db: Db }, input: ImportBody): Promise<{ imported: number }> {
  return withTx(deps.db, async (tx) => {
    if (input.kind === "airports") {
      const rows = parseRows(AirportCsvRow, input.csv);
      const regions = new Set([...REGIONS, ...(await airportsRepo.regions(tx))]);
      const details = rows
        .filter(({ row }) => !regions.has(row.region))
        .map(({ line }) => ({ path: `row ${line}.region`, message: `one of ${[...regions].sort().join(", ")}` }));
      if (details.length > 0) throw new ImportError(details.slice(0, MAX_DETAILS));
      for (const { line, row: r } of rows) {
        await writeRow(line, () =>
          airportsRepo.upsertMany(tx, [
            {
              code: r.code,
              name: r.name,
              city: r.city,
              country: r.country,
              countryCode: r.country_code,
              region: r.region,
              lat: r.lat,
              lng: r.lng,
              popularity: r.popularity,
              tz: r.tz,
              description: r.description,
            },
          ]),
        );
      }
      return { imported: rows.length };
    }

    const rows = parseRows(FareCsvRow, input.csv);
    // A fare between airports the catalogue does not know shows nowhere: one lookup for the file's codes.
    const known = await knownAirports(
      tx,
      rows.flatMap(({ row }) => [row.route_from, row.route_to]),
    );
    const details = rows.flatMap(({ line, row }) =>
      (["route_from", "route_to"] as const)
        .filter((k) => !known.has(row[k]))
        .map((k) => ({ path: `row ${line}.${k}`, message: `no airport ${row[k]} in the catalogue` })),
    );
    if (details.length > 0) throw new ImportError(details.slice(0, MAX_DETAILS));
    for (const { line, row: r } of rows) {
      await writeRow(line, () =>
        faresRepo.upsertImport(tx, {
          routeFrom: r.route_from,
          routeTo: r.route_to,
          cabin: r.cabin,
          carrier: r.carrier?.toUpperCase() ?? null,
          carrierName: r.carrier_name ?? null,
          product: r.product ?? null,
          nonstop: r.nonstop,
          durationMinutes: r.duration_minutes ?? null,
          price: r.price,
          publishedPrice: r.published_price ?? null,
          publishedSource: r.published_source ?? null,
          currency: r.currency,
          trip: r.trip,
          validFrom: new Date(r.valid_from),
          validUntil: new Date(r.valid_until),
        }),
      );
    }
    return { imported: rows.length };
  });
}
