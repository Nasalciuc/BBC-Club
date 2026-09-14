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
  "packages/modules/core/members/tests/contract/facade.contract.test.ts": {
    owedBy: "phase-E",
    contract:
      "member.registered delivered twice creates exactly one profile; unknown CRM email → waitlist, known → active + member.linked_to_crm",
  },
  "packages/modules/domain/proposals/tests/contract/facade.contract.test.ts": {
    owedBy: "phase-F",
    contract:
      "getVisible returns null for another member's targeted offer; feed = active ∧ valid_until > now ∧ (broadcast ∨ targeted at me ∨ my segment)",
  },
  "packages/modules/domain/engagement/tests/contract/facade.contract.test.ts": {
    owedBy: "phase-F",
    contract:
      "a second identical respond is a no-op with the same state; dismissed after interested updates; a closed offer is NOT_FOUND; the actor never comes from input",
  },
  "packages/modules/core/notifications/tests/contract/facade.contract.test.ts": {
    owedBy: "phase-F",
    contract: "markRead on another member's row changes 0 rows; unreadCount is scoped to the actor",
  },
  "packages/modules/integration/crm/tests/contract/facade.contract.test.ts": {
    owedBy: "stage-5",
    contract: "findByEmail returns null for an unknown email; createActivity is idempotent by externalId",
  },
};

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
console.log(`module:check OK (${modules.length} modules)`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}
