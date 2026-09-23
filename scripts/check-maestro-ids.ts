/**
 * Fitness: every Maestro `id:` in apps/mobile/e2e/*.yaml exists as a `testID`
 * in apps/mobile/src or packages/ui/src. `*` and `${…}` are wildcards.
 * Catches stale ids (e.g. feed.root) in CI without running Maestro.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseAllDocuments } from "yaml";

const root = join(import.meta.dir, "..");
const e2eDir = join(root, "apps/mobile/e2e");
const srcRoots = [join(root, "apps/mobile/src"), join(root, "packages/ui/src")];

const problems: string[] = [];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      out.push(...walk(p));
    } else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

/** `${expr}` → `*`; Maestro/yaml wildcards already use `*`. */
function toGlob(id: string): string {
  return id.replace(/\$\{[^}]+\}/g, "*");
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((part) => escapeRegex(part))
    .join(".*");
  return new RegExp(`^${body}$`);
}

/** Collect testID globs from source (literals + templates + DEFAULT_TEST_IDS maps). */
function extractSourceGlobs(src: string): string[] {
  const globs = new Set<string>();

  const add = (raw: string) => {
    const g = toGlob(raw.trim());
    if (g.length > 0) globs.add(g);
  };

  // testID="…" | testID='…'
  for (const m of src.matchAll(/testID\s*=\s*(["'])([^"'\\]*(?:\\.[^"'\\]*)*)\1/g)) {
    add(m[2]!);
  }
  // testID={`…`} | testID={"…"} | testID={'…'}
  for (const m of src.matchAll(/testID\s*=\s*\{\s*(["'`])([\s\S]*?)\1\s*\}/g)) {
    add(m[2]!);
  }
  // DEFAULT_TEST_IDS / TEST_IDS = { explore: "tab.explore", … }
  for (const m of src.matchAll(/(?:DEFAULT_)?TEST_IDS?\s*(?::[^=]*)?=\s*\{([^}]*)\}/g)) {
    for (const sm of m[1]!.matchAll(/(["'])([^"'\\]+)\1/g)) {
      add(sm[2]!);
    }
  }

  return [...globs];
}

function collectYamlIds(node: unknown, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectYamlIds(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.id === "string") out.push(obj.id);
  for (const v of Object.values(obj)) collectYamlIds(v, out);
}

function covered(yamlId: string, sourceGlobs: string[]): boolean {
  const yamlGlob = toGlob(yamlId);
  if (sourceGlobs.includes(yamlGlob)) return true;

  // Concrete yaml id matched by a source template/wildcard (explore.fare.${id} → explore.fare.*)
  if (!yamlGlob.includes("*")) {
    return sourceGlobs.some((g) => globToRegExp(g).test(yamlGlob));
  }

  // Yaml is itself a wildcard (requests.row.*) — require a compatible source glob
  return sourceGlobs.some((g) => {
    if (g === yamlGlob) return true;
    if (!g.includes("*") && globToRegExp(yamlGlob).test(g)) return true;
    const yamlPrefix = yamlGlob.split("*")[0]!;
    return g.includes("*") && g.startsWith(yamlPrefix);
  });
}

const sourceGlobs = new Set<string>();
for (const dir of srcRoots) {
  for (const file of walk(dir)) {
    for (const g of extractSourceGlobs(readFileSync(file, "utf8"))) sourceGlobs.add(g);
  }
}
const sourceList = [...sourceGlobs];

if (!existsSync(e2eDir)) {
  console.error(`missing ${relative(root, e2eDir)}`);
  process.exit(1);
}

const yamlFiles = readdirSync(e2eDir)
  .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
  .map((f) => join(e2eDir, f))
  .sort();

if (yamlFiles.length === 0) {
  console.error(`no Maestro flows under ${relative(root, e2eDir)}`);
  process.exit(1);
}

for (const file of yamlFiles) {
  const rel = relative(root, file).replace(/\\/g, "/");
  let docs: ReturnType<typeof parseAllDocuments>;
  try {
    docs = parseAllDocuments(readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`${rel}: invalid YAML (${e instanceof Error ? e.message : String(e)})`);
    continue;
  }
  const ids: string[] = [];
  for (const doc of docs) {
    if (doc.errors.length > 0) {
      problems.push(`${rel}: invalid YAML (${doc.errors[0]!.message})`);
      continue;
    }
    collectYamlIds(doc.toJSON(), ids);
  }
  for (const id of ids) {
    if (!covered(id, sourceList)) {
      problems.push(`${rel}: id "${id}" has no matching testID in apps/mobile/src or packages/ui/src`);
    }
  }
}

if (problems.length > 0) {
  console.error("check-maestro-ids failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}

console.log(`check-maestro-ids: ${yamlFiles.length} flows, ${sourceList.length} source testID globs — ok`);
