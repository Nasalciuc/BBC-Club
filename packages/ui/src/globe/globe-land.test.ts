import { expect, it } from "bun:test";
import { join } from "node:path";

// The committed land data must be exactly what the generator produces — nobody edits it by hand.
it("globe land data matches packages/ui/scripts/globe-land.ts", () => {
  const script = join(import.meta.dir, "..", "..", "scripts", "globe-land.ts");
  const run = Bun.spawnSync(["bun", script, "--check"], { stdout: "pipe", stderr: "pipe" });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
});
