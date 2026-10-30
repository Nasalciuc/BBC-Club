/** Destructive statements in a NEW or CHANGED migration must say why, on the line above:
 *    -- destructive: <reason>
 *  It forbids nothing — the repo's rule stays expand-only, and a destructive step is its own announced PR — it makes
 *  the operation visible in review. Only files that differ from origin/main are read: 0001 / 0004 / 0007 already contain
 *  legitimate destructive statements (the journal's partitioning, the bigint fix) and are history. */
import { readFileSync } from "node:fs";

// Read on each statement's text (comments stripped, lines joined up to its `;`), so a statement split across lines
// is caught too. A column's type change is caught with or without the COLUMN keyword and with SET DATA TYPE; a column
// or a table named `type` is not taken for one.
const DESTRUCTIVE =
  /\b(DROP\s+(?:TABLE|SCHEMA|COLUMN|INDEX(?!\s+CONCURRENTLY))|TRUNCATE|ALTER\s+(?:COLUMN\s+)?(?!(?:COLUMN|TABLE)\s)\S+\s+(?:SET\s+DATA\s+)?TYPE)\b/gi;
const TYPE_CHANGE = /^ALTER\s/i;
// A DELETE up to its semicolon, or to the end of the file when it is the last statement. Then keep only the matches
// without \bWHERE\b.
const DELETE_WITHOUT_WHERE = /\bDELETE\s+FROM\s+[^;]*(?:;|$)/gi;
const REASON = /^\s*--\s*destructive:\s*\S/i;

export type Unannounced = { line: number; text: string; typeChange: boolean };

/** The destructive statements in one migration's text with no `-- destructive:` reason on the line above — above the
 *  line the operation is on, or above the line its statement starts on. Lines are 1-based. */
export function findUnannounced(sql: string): Unannounced[] {
  const lines = sql.split("\n");
  const reasonAbove = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if ((lines[j] ?? "").trim() !== "") return REASON.test(lines[j] ?? "");
    return false;
  };
  const text = lines.map((l) => l.replace(/--.*$/, "")).join("\n");
  const lineAt = (offset: number) => text.slice(0, offset).split("\n").length - 1;
  const found: Unannounced[] = [];
  let start = 0;
  for (const statement of text.split(";")) {
    const lead = statement.length - statement.trimStart().length;
    const first = lineAt(start + lead);
    for (const m of statement.matchAll(DESTRUCTIVE)) {
      const at = lineAt(start + (m.index ?? 0));
      if (!reasonAbove(at) && !reasonAbove(first))
        found.push({ line: at + 1, text: (lines[at] ?? "").trim(), typeChange: TYPE_CHANGE.test(m[0]) });
    }
    start += statement.length + 1;
  }
  for (const m of text.matchAll(DELETE_WITHOUT_WHERE)) {
    if (/\bWHERE\b/i.test(m[0])) continue;
    const at = lineAt(m.index ?? 0);
    if (!reasonAbove(at)) found.push({ line: at + 1, text: m[0].split("\n")[0]?.trim() ?? "", typeChange: false });
  }
  return found.sort((a, b) => a.line - b.line);
}

function git(args: string[]): { ok: boolean; out: string } {
  const r = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() };
}

if (import.meta.main) {
  if (!git(["rev-parse", "--verify", "--quiet", "origin/main"]).ok) {
    console.error("check-destructive-migrations: origin/main is not available — fetch it (CI: fetch-depth: 0).");
    process.exit(1);
  }
  const changed = git(["diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD", "--", "packages/db/migrations"])
    .out.split("\n")
    .concat(git(["diff", "--name-only", "--diff-filter=AM", "HEAD", "--", "packages/db/migrations"]).out.split("\n"))
    .concat(git(["ls-files", "--others", "--exclude-standard", "--", "packages/db/migrations"]).out.split("\n"))
    .filter((f) => f.endsWith(".sql"));

  const problems = [...new Set(changed)].flatMap((file) =>
    findUnannounced(readFileSync(file, "utf8")).map((p) => ({ ...p, at: `${file}:${p.line}: ${p.text}` })),
  );
  if (problems.length) {
    console.error("destructive statements need `-- destructive: <reason>` on the line above:");
    for (const p of problems) console.error(`  ${p.at}`);
    if (problems.some((p) => p.typeChange))
      console.error(
        "A column's new type also breaks what live replicas have prepared on it (ADR-IMPL-074): add a column, backfill, switch the reads, drop later.",
      );
    process.exit(1);
  }
  console.log(`destructive-migrations: ${changed.length} new or changed migration file(s), nothing unannounced`);
}
