import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "@bbc/shared/fixture";
import { fareFacts } from "./fare-facts";

async function factsUnder(tz: string): Promise<string> {
  const child = Bun.spawn({
    cmd: ["bun", join(import.meta.dir, "print-fa01-facts.ts")],
    env: { ...process.env, TZ: tz },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`print-fa01-facts failed under ${tz} (${code}): ${err || out}`);
  return out.trim();
}

describe("fareFacts", () => {
  it("includes times when departLocal and arriveLocal are set", () => {
    expect(fareFacts(fixture.fares[0]!)).toBe("18:55 — 07:00 +1 · 7H 05");
  });

  it("does not invent times when departLocal is null", () => {
    const facts = fareFacts(fixture.fares[2]!);
    expect(facts).not.toMatch(/\d{2}:\d{2}/);
    expect(facts).toContain("NONSTOP");
  });

  it("is identical in Chișinău and Los Angeles", async () => {
    const chisinau = await factsUnder("Europe/Chisinau");
    const la = await factsUnder("America/Los_Angeles");
    expect(chisinau).toBe(la);
    expect(chisinau).toBe("18:55 — 07:00 +1 · 7H 05");
  });

  it("does not call toLocaleTimeString", () => {
    const src = readFileSync(join(import.meta.dir, "fare-facts.ts"), "utf8");
    expect(src).not.toContain("toLocaleTimeString");
  });
});
