import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rolePermissions } from "@bbc/shared/authz/permissions";

/** authorize("x:y") with a permission nobody declared returns 403 to everyone, silently. */
const declared = new Set(Object.values(rolePermissions).flat());
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? (f === "node_modules" ? [] : walk(p)) : p.endsWith(".ts") ? [p] : [];
  });

describe("every authorize() permission is declared", () => {
  const used = new Set<string>();
  for (const f of [...walk(join(repoRoot, "apps/api/src")), ...walk(join(repoRoot, "packages/modules"))]) {
    for (const m of readFileSync(f, "utf8").matchAll(/authorize\("([a-z-]+:[a-z-]+)"/g)) used.add(m[1]);
  }
  for (const p of used) it(p, () => expect(declared.has(p as any)).toBe(true));
  it("finds at least the two routes that exist today", () => expect(used.size).toBeGreaterThanOrEqual(2));
});
