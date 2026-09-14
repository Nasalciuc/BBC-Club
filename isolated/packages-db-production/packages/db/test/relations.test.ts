import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/** A relation part may reference only tables from its own schema file. Cross-schema relations are cross-module JOINs. */
describe("relations stay inside their module", () => {
  const dir = new URL("../src/relations/", import.meta.url).pathname;
  const ownership: Record<string, string> = {
    proposals: "proposals",
    notifications: "notifications",
    personalization: "personalization",
  };
  for (const f of readdirSync(dir).filter((x) => x !== "index.ts")) {
    it(f, () => {
      const src = readFileSync(dir + f, "utf8");
      const schemaFile = ownership[f.replace(".ts", "")];
      const referenced = [...src.matchAll(/r\.(?:one|many)\.(\w+)/g)].map((m) => m[1]);
      const own = readFileSync(new URL(`../src/schema/${schemaFile}.ts`, import.meta.url).pathname, "utf8");
      for (const table of referenced) expect(own.includes(`export const ${table}`)).toBe(true);
    });
  }
});
