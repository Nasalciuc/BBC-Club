/**
 * The site's destinations, read now and shown, without a database (ADR-IMPL-045). Reads the company's site the way the
 * nightly job does, matches each city to the reference airports (packages/db/seeds/airports-reference.tsv), asks for each
 * city's own photo as the job does (a HEAD request, which also gives its size), and writes one HTML page: every city with
 * its photo (loaded from the site), the airports it lands on, whether the photo is its own and answers, what a phone
 * downloads for it, and the prices the site lists from US cities. Prints a summary. Writes nothing anywhere else.
 *   bun run scripts/site-destinations-report.ts [--out <file.html>]
 * The default file is in the system's temporary folder; the path is printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseReference, REFERENCE_TSV } from "../packages/db/scripts/airports-reference";
import {
  SITE_STORAGE,
  imageCheck,
  inPool,
  readSite,
  type SiteDeps,
} from "../packages/modules/domain/catalog/src/application/site-cms";
import { imageOf, planSite } from "../packages/modules/domain/catalog/src/application/site-places";

const at = process.argv.indexOf("--out");
const out = (at > 0 ? process.argv[at + 1] : undefined) ?? join(tmpdir(), "site-destinations-report.html");

const airports = parseReference(readFileSync(REFERENCE_TSV, "utf8")).map((a) => ({
  code: a.code,
  city: a.city,
  country: a.country,
  countryCode: a.countryCode,
  searchTerms: a.searchTerms ?? null,
  popularity: a.popularity ?? 0,
}));
/** Each photo's size as its HEAD answer gives it: what a phone downloads for it (the app shows the site's file as is). */
const sizes = new Map<string, number>();
const deps: SiteDeps = {
  fetch: async (url, init) => {
    const res = await fetch(url, init);
    const size = Number(res.headers.get("content-length"));
    if (init?.method === "HEAD" && size > 0) sizes.set(url, size);
    return res;
  },
  userAgent: "BBCClub/1.0 (site destinations report)",
  signal: AbortSignal.timeout(600_000),
};
const read = await readSite(deps);
const plan = planSite(read, airports);
// Each own photo asked for the way the nightly job asks: what the job would put on the airports tonight.
const checks = await inPool(plan.places, 4, (p) =>
  p.image ? imageCheck(deps, SITE_STORAGE + p.image) : Promise.resolve(null),
);
const answers = new Map(plan.places.map((p, i) => [p.cmsId, checks[i] ?? null]));
const asked = checks.filter((c) => c !== null);
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
const weighed = plan.places
  .flatMap((p) => {
    const size = p.image ? sizes.get(SITE_STORAGE + p.image) : undefined;
    return size ? [{ name: p.name, size }] : [];
  })
  .sort((a, b) => a.size - b.size);
const median = weighed.at(Math.floor(weighed.length / 2));
const largest = weighed.at(-1);
const placed = new Map(plan.places.map((p) => [p.cmsId, p]));
const routes = new Map<number, number>();
for (const r of plan.routes) routes.set(r.cmsId, (routes.get(r.cmsId) ?? 0) + 1);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rows = [...read.cities]
  .sort(
    (a, b) => a.region.localeCompare(b.region) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name),
  )
  .map((city) => {
    const place = placed.get(city.id);
    const image = imageOf(city);
    const photo = city.image ? `<img loading="lazy" src="${esc(SITE_STORAGE + city.image)}" alt="">` : "";
    const answer = answers.get(city.id);
    const size = city.image ? sizes.get(SITE_STORAGE + city.image) : undefined;
    const verdict =
      image.kind !== "own"
        ? `<b>${image.kind}</b>`
        : answer && answer !== "yes"
          ? `own · <b>${answer}</b>`
          : `own${size ? ` · ${kb(size)}` : ""}`;
    const deals = city.deals
      .map((d) => `${esc(d.from)}: ${d.price ?? "—"}${d.publishedPrice ? ` (was ${d.publishedPrice})` : ""}`)
      .join("<br>");
    return `<tr><td>${photo}</td><td><b>${esc(city.name)}</b><br>${esc(city.country)} · ${esc(city.region)}<br>id ${city.id}${
      read.promoted.has(city.id) ? " · home page" : ""
    }</td><td>${place ? esc(place.airports.join(" ")) : "<b>no airport</b>"}</td><td>${verdict}</td><td>${
      routes.get(city.id) ?? 0
    }</td><td>${deals}</td></tr>`;
  })
  .join("\n");

const summary = [
  `cities read: ${read.cities.length} (pages that did not answer: ${read.failed.length}${read.failed.length ? ` — ${read.failed.join(", ")}` : ""})`,
  `placed: ${plan.places.length}, on ${new Set(plan.places.flatMap((p) => p.airports)).size} airports`,
  `own photos: ${plan.places.filter((p) => p.image).length}`,
  `own photos asked (HEAD): ${asked.filter((c) => c === "yes").length} answer, ${asked.filter((c) => c === "no").length} gone or not an image, ${asked.filter((c) => c === "unknown").length} could not be asked`,
  `own photo sizes: ${median && largest ? `median ${kb(median.size)}, largest ${kb(largest.size)} (${largest.name}), ${weighed.filter((w) => w.size > 1024 * 1024).length} over 1 MB` : "not given"}`,
  `no airport: ${plan.unmapped.map((c) => `${c.name} (${c.country}, ${c.id})`).join("; ") || "none"}`,
  `borrowed photos: ${plan.borrowed.map((c) => `${c.name} (${c.id}) ← ${c.image}`).join("; ") || "none"}`,
  `odd photo paths: ${plan.odd.map((c) => `${c.name} (${c.id}): ${c.image}`).join("; ") || "none"}`,
  `main airport by a tie (list them): ${plan.ties.map((c) => `${c.name} (${c.id}): ${c.airports.join(" ")}`).join("; ") || "none"}`,
  `US cities without an airport: ${plan.unknownOrigins.join(", ") || "none"}`,
  `routes (US airport → city): ${plan.routes.length}`,
];

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>The site's destinations</title>
<style>body{font:14px system-ui;margin:24px}td{border-top:1px solid #ccc;padding:6px;vertical-align:top}img{width:240px;height:150px;object-fit:cover}</style>
<h1>The site's destinations</h1><pre>${esc(summary.join("\n"))}</pre>
<table><tr><th>Photo</th><th>City</th><th>Airports</th><th>Photo is</th><th>Routes</th><th>Prices on the site</th></tr>
${rows}</table>`,
);
console.log(summary.join("\n"));
console.log(`report: ${out}`);
