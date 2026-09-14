/** Fitness function for the module skeleton: every module has the folders, the exports map, a MODULE.md with the
 *  required sections, and no `it.todo` left in its contract tests. */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const problems: string[] = [];
const REQUIRED_SECTIONS = ["**Owns:**", "**Publishes:**", "**Consumes:**", "**Facade"];
const base = "packages/modules";
const modules: string[] = [];
for (const layer of readdirSync(base)) {
  const lp = join(base, layer);
  if (!statSync(lp).isDirectory()) continue;
  if (existsSync(join(lp, "package.json")))
    modules.push(lp); // platform lives at layer root
  else for (const m of readdirSync(lp)) if (statSync(join(lp, m)).isDirectory()) modules.push(join(lp, m));
}
for (const m of modules) {
  const pkg = JSON.parse(readFileSync(join(m, "package.json"), "utf8")) as {
    exports?: { "."?: string };
  };
  const exp = pkg.exports?.["."];
  if (exp !== "./src/api/index.ts") problems.push(`${m}: exports["."] must be ./src/api/index.ts (got ${exp})`);
  if (!existsSync(join(m, "MODULE.md"))) problems.push(`${m}: MODULE.md missing`);
  else {
    const md = readFileSync(join(m, "MODULE.md"), "utf8");
    for (const s of REQUIRED_SECTIONS) if (!md.includes(s)) problems.push(`${m}: MODULE.md lacks ${s}`);
  }
  if (!existsSync(join(m, "src/api/index.ts"))) problems.push(`${m}: src/api/index.ts missing`);
  const tests = join(m, "tests");
  if (existsSync(tests))
    for (const f of walk(tests))
      if (readFileSync(f, "utf8").includes("it.todo(")) problems.push(`${f}: unfinished it.todo`);
}
if (problems.length) {
  console.error("module:check FAILED\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`module:check OK (${modules.length} modules)`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}
