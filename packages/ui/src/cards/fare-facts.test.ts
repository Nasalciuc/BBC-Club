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
  it("reads the stops and the time in the air, as Figma 89:387 draws them", () => {
    expect(fareFacts(fixture.fares[0]!)).toBe("NONSTOP · 7H 05");
  });

  it("leaves the clocks to the fare's page, even when the fare has them", () => {
    expect(fixture.fares[0]!.departLocal).toBe("18:55");
    expect(fareFacts(fixture.fares[0]!)).not.toMatch(/\d{2}:\d{2}/);
  });

  it("reads 1 STOP for a fare with a stop", () => {
    expect(fareFacts(fixture.fares[5]!)).toBe("1 STOP · 18H 20");
  });

  it("drops the time when the fare has no duration", () => {
    expect(fareFacts({ nonstop: true, durationMinutes: null })).toBe("NONSTOP");
  });

  it("is identical in Chișinău and Los Angeles", async () => {
    const chisinau = await factsUnder("Europe/Chisinau");
    const la = await factsUnder("America/Los_Angeles");
    expect(chisinau).toBe(la);
    expect(chisinau).toBe("NONSTOP · 7H 05");
  });

  it("does not call toLocaleTimeString", () => {
    const src = readFileSync(join(import.meta.dir, "fare-facts.ts"), "utf8");
    expect(src).not.toContain("toLocaleTimeString");
  });
});
