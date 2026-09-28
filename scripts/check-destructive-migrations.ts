/** Destructive statements in a NEW or CHANGED migration must say why, on the line above:
 *    -- destructive: <reason>
 *  It forbids nothing — the repo's rule stays expand-only, and a destructive step is its own announced PR — it makes
 *  the operation visible in review. Only files that differ from origin/main are read: 0001 / 0004 / 0007 already contain
 *  legitimate destructive statements (the journal's partitioning, the bigint fix) and are history. */
import { readFileSync } from "node:fs";

const DESTRUCTIVE =
  /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|DROP\s+INDEX(?!\s+CONCURRENTLY))\b/i;
const DELETE_WITHOUT_WHERE = /\bDELETE\s+FROM\s+[^;]*;/gi; // then keep only matches without \bWHERE\b
const REASON = /^\s*--\s*destructive:\s*\S/i;

function git(args: string[]): { ok: boolean; out: string } {
  const r = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() };
}

if (!git(["rev-parse", "--verify", "--quiet", "origin/main"]).ok) {
  console.error("check-destructive-migrations: origin/main is not available — fetch it (CI: fetch-depth: 0).");
  process.exit(1);
}
const changed = git(["diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD", "--", "packages/db/migrations"])
  .out.split("\n")
  .concat(git(["diff", "--name-only", "--diff-filter=AM", "HEAD", "--", "packages/db/migrations"]).out.split("\n"))
  .concat(git(["ls-files", "--others", "--exclude-standard", "--", "packages/db/migrations"]).out.split("\n"))
  .filter((f) => f.endsWith(".sql"));

const problems: string[] = [];
for (const file of [...new Set(changed)]) {
  const lines = readFileSync(file, "utf8").split("\n");
  const reasonAbove = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if ((lines[j] ?? "").trim() !== "") return REASON.test(lines[j] ?? "");
    return false;
  };
  lines.forEach((line, i) => {
    const code = line.replace(/--.*$/, "");
    if (DESTRUCTIVE.test(code) && !reasonAbove(i)) problems.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  // DELETE without WHERE can span lines: search the file with comments stripped, then map back to a line.
  const text = lines.map((l) => l.replace(/--.*$/, "")).join("\n");
  for (const m of text.matchAll(DELETE_WITHOUT_WHERE)) {
    if (/\bWHERE\b/i.test(m[0])) continue;
    const line = text.slice(0, m.index).split("\n").length - 1;
    if (!reasonAbove(line)) problems.push(`${file}:${line + 1}: ${m[0].split("\n")[0]?.trim()}`);
  }
}

if (problems.length) {
  console.error("destructive statements need `-- destructive: <reason>` on the line above:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`destructive-migrations: ${changed.length} new or changed migration file(s), nothing unannounced`);
