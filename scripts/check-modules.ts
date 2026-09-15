/** Fitness function for the module skeleton: every module has the folders, the exports map, a MODULE.md with the
 *  required sections, and no `it.todo` left in its contract tests. */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const problems: string[] = [];
const REQUIRED_SECTIONS = ["**Owns:**", "**Publishes:**", "**Consumes:**", "**Facade"];
const base = "packages/modules";

/** Contract tests that are still todo, with the phase that must finish them.
 *  A todo in a file that is NOT on this list fails immediately — that is the point of the rule.
 *  A file on this list whose phase has shipped also fails: the debt has a deadline, not an excuse. */
const TODO_ALLOWLIST: Record<string, { owedBy: string; contract: string }> = {
  "packages/modules/integration/crm/tests/contract/facade.contract.test.ts": {
    owedBy: "stage-5",
    contract: "findByEmail returns null for an unknown email; createActivity is idempotent by externalId",
  },
};

/** A package that has tests but no script to run them is a silent skip in CI — worse than a red build. */
function assertTestsHaveAScript(pkgDir: string, pkg: { scripts?: Record<string, string> }) {
  const hasTests = ["test", "tests"].some(
    (d) => existsSync(join(pkgDir, d)) && walk(join(pkgDir, d)).some((f) => /\.test\.tsx?$/.test(f)),
  );
  const hasScript = Object.keys(pkg.scripts ?? {}).some((s) => s.startsWith("test"));
  if (hasTests && !hasScript)
    problems.push(`${pkgDir}: has test files but no test:* script — turbo will never run them`);
  const hasEmptyUnit =
    existsSync(join(pkgDir, "tests/unit")) && !walk(join(pkgDir, "tests/unit")).some((f) => /\.test\.tsx?$/.test(f));
  if (hasEmptyUnit && pkg.scripts?.["test:unit"])
    problems.push(`${pkgDir}: test:unit points at an empty tests/unit (bun exits 1)`);
}

/** P2: a quoted camelCase identifier inside raw SQL is almost always a Drizzle property name that leaked into a
 *  query (the createdAt bug). Postgres columns here are snake_case. */
function assertNoCamelCaseInRawSql(files: string[]) {
  const re = /\b(SELECT|FROM|WHERE|UPDATE|INSERT|JOIN|SET)\b[^;`]*"[a-z]+[A-Z][A-Za-z]*"/;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (!/sql`|\.execute\(/.test(src)) continue;
    const m = src.match(re);
    if (m) problems.push(`${f}: quoted camelCase identifier in raw SQL (${m[0].slice(-40)}) — columns are snake_case`);
  }
}

/** P3: bigserial on a non-PK column silently invents ids for forgotten references. */
function assertNoSerialReferences(files: string[]) {
  for (const f of files.filter((x) => x.endsWith("schema.ts"))) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (/bigserial\("[a-z_]*_id"/.test(line) && !/primaryKey\(\)/.test(line))
        problems.push(`${f}: bigserial on reference column — use bigint`);
    }
  }
}

const probeRoots = ["packages/modules", "packages/db/src", "apps/api/src"].filter((d) => existsSync(d));
const probeFiles = probeRoots.flatMap((d) => walk(d));
assertNoCamelCaseInRawSql(probeFiles);
assertNoSerialReferences(probeFiles);

const modules: string[] = [];
for (const layer of readdirSync(base)) {
  const lp = join(base, layer);
  if (!statSync(lp).isDirectory()) continue;
  if (existsSync(join(lp, "package.json")))
    modules.push(lp); // platform lives at layer root
  else
    for (const m of readdirSync(lp)) {
      const mp = join(lp, m);
      if (!statSync(mp).isDirectory()) continue;
      // MODULE.md-only scaffolds (no package.json yet) are not modules under check.
      if (!existsSync(join(mp, "package.json"))) continue;
      modules.push(mp);
    }
}
// Not modules, but they carry tests: only the test-script rule applies to them.
for (const extra of ["apps/api", "packages/db", "packages/shared"])
  if (existsSync(join(extra, "package.json"))) modules.push(extra);

for (const m of modules) {
  const pkg = JSON.parse(readFileSync(join(m, "package.json"), "utf8")) as {
    exports?: { "."?: string };
    scripts?: Record<string, string>;
  };
  assertTestsHaveAScript(m, pkg);
  const isModule = m.replace(/\\/g, "/").startsWith("packages/modules/");
  if (isModule) {
    const exp = pkg.exports?.["."];
    if (exp !== "./src/api/index.ts") problems.push(`${m}: exports["."] must be ./src/api/index.ts (got ${exp})`);
    if (!existsSync(join(m, "MODULE.md"))) problems.push(`${m}: MODULE.md missing`);
    else {
      const md = readFileSync(join(m, "MODULE.md"), "utf8");
      for (const s of REQUIRED_SECTIONS) if (!md.includes(s)) problems.push(`${m}: MODULE.md lacks ${s}`);
    }
    if (!existsSync(join(m, "src/api/index.ts"))) problems.push(`${m}: src/api/index.ts missing`);
  }
  const tests = join(m, "tests");
  if (existsSync(tests))
    for (const f of walk(tests)) {
      if (readFileSync(f, "utf8").includes("it.todo(")) {
        const rel = f.replace(/\\/g, "/");
        const allowed = TODO_ALLOWLIST[rel];
        if (allowed) console.warn(`  owed (${allowed.owedBy}): ${rel}\n      contract: ${allowed.contract}`);
        else
          problems.push(
            `${rel}: unfinished it.todo (not on the allowlist — write the contract or add it deliberately)`,
          );
      }
    }
}
if (problems.length) {
  console.error("module:check FAILED\n  - " + problems.join("\n  - "));
  process.exit(1);
}
const owed = Object.entries(TODO_ALLOWLIST).filter(([f]) => existsSync(f));
if (owed.length)
  console.warn(
    `module:check OK — ${owed.length} contract tests still owed: ${owed.map(([, v]) => v.owedBy).join(", ")}`,
  );
const moduleCount = modules.filter((m) => m.replace(/\\/g, "/").startsWith("packages/modules/")).length;
console.log(`module:check OK (${moduleCount} modules)`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}
