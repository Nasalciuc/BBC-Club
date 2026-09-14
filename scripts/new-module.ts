/** `bun run new-module <name> --layer core|domain|intelligence|integration`
 *  Stamps the skeleton every module must have. The generated contract test FAILS until it is written —
 *  a new module cannot be green by accident. */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [name, flag, layer] = process.argv.slice(2);
const LAYERS = ["core", "domain", "intelligence", "integration"];
if (!name || flag !== "--layer" || !LAYERS.includes(layer)) {
  console.error("usage: bun run new-module <name> --layer core|domain|intelligence|integration");
  process.exit(1);
}
if (!/^[a-z][a-z-]+$/.test(name)) {
  console.error("module name must be kebab-case");
  process.exit(1);
}

const root = join("packages/modules", layer, name);
if (existsSync(root)) {
  console.error(`${root} already exists`);
  process.exit(1);
}
const pascal = name.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
const schemaName = name.replace(/-/g, "_");

const files: Record<string, string> = {
  "package.json":
    JSON.stringify(
      {
        name: `@bbc/${name}`,
        version: "0.1.0",
        private: true,
        type: "module",
        exports: {
          ".": "./src/api/index.ts",
          "./module": "./src/module.ts",
          "./schema": "./src/infrastructure/schema.ts",
        },
        scripts: {
          "test:unit": "bun test tests/unit",
          "test:db": "bun test tests/contract tests/handlers",
          typecheck: "tsc --noEmit",
        },
        dependencies: {
          "drizzle-orm": "^1.0.0",
          zod: "^3.24.0",
          "@bbc/shared": "workspace:*",
          "@bbc/db": "workspace:*",
          "@bbc/platform": "workspace:*",
        },
      },
      null,
      2,
    ) + "\n",
  "tsconfig.json":
    JSON.stringify({ extends: "../../../../tsconfig.base.json", include: ["src", "tests"] }, null, 2) + "\n",
  "MODULE.md": `# ${layer}/${name}
**Owns:** schema \`${schemaName}.*\` — (tables)
**Publishes:** (events, versioned in packages/shared/events)
**Consumes:** (events → handlers/)
**Ports:** (interfaces in ports/ that integration adapters or other facades satisfy)
**Facade (\`src/api/index.ts\`):** (functions other modules may call)
**Out of scope:** (what this module deliberately does not do)
**Invariants tested:** (list; tests/contract must cover the facade)
`,
  "src/api/index.ts": `/** The only import surface of @bbc/${name}. Other modules and the host see nothing else. */
export type ${pascal}Facade = ReturnType<typeof create${pascal}Facade>;
export function create${pascal}Facade(_deps: { db: unknown }) {
  return {};
}
`,
  "src/module.ts": `import type { ModuleDescriptor } from "@bbc/api/registry";
import { create${pascal}Facade } from "./api";

export const ${camel(name)}Module = (): ModuleDescriptor<{}, ReturnType<typeof create${pascal}Facade>> => ({
  name: "${name}",
  layer: "${layer}",
  needs: [],
  init: ({ db }) => ({ exposes: create${pascal}Facade({ db }), routes: [], consumers: [], jobs: [] }),
});
`,
  "src/infrastructure/schema.ts": `import { pgSchema } from "drizzle-orm/pg-core";
/** One Postgres schema per module. Tables here are owned by ${name} only; no FK may point across schemas. */
export const ${camel(schemaName)} = pgSchema("${schemaName}");
`,
  "src/application/.gitkeep": "",
  "src/domain/.gitkeep": "",
  "src/handlers/.gitkeep": "",
  "src/ports/.gitkeep": "",
  "tests/contract/facade.contract.test.ts": `import { describe, it } from "bun:test";
describe("@bbc/${name} facade", () => {
  it.todo("TODO: contract test for ${name} — write it before merging (a todo keeps validate red)");
});
`,
  "tests/unit/.gitkeep": "",
  "tests/handlers/.gitkeep": "",
};
for (const [rel, content] of Object.entries(files)) {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content);
}
console.log(`created ${root}\nnext: add it to apps/api/src/modules.ts, fill MODULE.md, write the contract test.`);

function camel(s: string) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
