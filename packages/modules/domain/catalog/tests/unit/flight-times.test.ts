import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "@bbc/shared/fixture";
import { assertIanaZone } from "../../src/application/flight-local";
import { fareFactsLine, mapFa01 } from "./fa01-map";

const csvPath = join(import.meta.dir, "../../../../../db/seeds/airports.csv");

async function clocksUnder(tz: string): Promise<string> {
  const child = Bun.spawn({
    cmd: ["bun", join(import.meta.dir, "print-fa01-clocks.ts")],
    env: { ...process.env, TZ: tz },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`print-fa01-clocks failed under ${tz} (${code}): ${err || out}`);
  return out.trim();
}

describe("flight local times", () => {
  it("arriveAt − departAt == durationMinutes on every timed fixture fare", () => {
    for (const fare of fixture.fares) {
      if (!fare.departAt || !fare.arriveAt || fare.durationMinutes == null) continue;
      const minutes = (Date.parse(fare.arriveAt) - Date.parse(fare.departAt)) / 60_000;
      expect(minutes, fare.id).toBe(fare.durationMinutes);
    }
  });

  it("maps fa01 to 18:55, 07:00, +1", () => {
    const vm = mapFa01();
    expect(vm.departLocal).toBe("18:55");
    expect(vm.arriveLocal).toBe("07:00");
    expect(vm.arriveDayOffset).toBe(1);
    expect(fareFactsLine(vm)).toBe("18:55 — 07:00 +1 · 7H 05");
  });

  it("same fa01 clocks in Chișinău and Los Angeles", async () => {
    const chisinau = await clocksUnder("Europe/Chisinau");
    const la = await clocksUnder("America/Los_Angeles");
    expect(chisinau).toBe(la);
    expect(JSON.parse(chisinau)).toEqual({
      departLocal: "18:55",
      arriveLocal: "07:00",
      arriveDayOffset: 1,
      facts: "18:55 — 07:00 +1 · 7H 05",
    });
  });

  it("every airports.csv tz is a real IANA zone", () => {
    const [header, ...rows] = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
    expect(header?.split(",").at(-1)).toBe("tz");
    for (const line of rows) {
      const tz = line.split(",").at(-1)!;
      // Same check as importCatalog — DateTimeFormat, not supportedValuesOf
      // (Bun 1.3.4 ICU omits Asia/Kolkata from the list while still accepting it).
      expect(() => assertIanaZone(tz), tz).not.toThrow();
    }
  });
});
