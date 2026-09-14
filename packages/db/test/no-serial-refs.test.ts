import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** P3 regression: bigserial on a non-PK *_id invents ids when the insert forgets the FK. */
describe("schema: no serial defaults on reference columns", () => {
  it("platform schema uses bigint for event_id / delivery_id references", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../modules/platform/src/infrastructure/schema.ts"),
      "utf8",
    );
    for (const line of src.split("\n")) {
      if (/bigserial\("[a-z_]*_id"/.test(line) && !/primaryKey\(\)/.test(line)) {
        throw new Error(`bigserial on reference column: ${line.trim()}`);
      }
    }
    expect(src).toContain('bigint("event_id"');
    expect(src).toContain('bigint("delivery_id"');
  });
});
