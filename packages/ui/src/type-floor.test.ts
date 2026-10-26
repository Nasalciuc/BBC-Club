/**
 * DESIGN.md's own floor on the generated type roles (`tokens.ts`, from DESIGN.md's front matter; ADR-IMPL-057, the
 * reading scale; ADR-IMPL-072). The floor's numbers are read from DESIGN.md's prose, so the test follows the file: a
 * floor raised there is enforced here at once, on every role under it.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tokens } from "./tokens";

const DESIGN = readFileSync(join(import.meta.dir, "..", "..", "..", "DESIGN.md"), "utf8").replace(/\s+/g, " ");

/** `nothing under 12 pt (11 for tracked capitals such as `INDICATIVE FARE`)`. */
const floorLine = DESIGN.match(/nothing under (\d+(?:\.\d+)?) pt \((\d+(?:\.\d+)?) for tracked capitals/);
/** `The globe's labels stay compact (`pin` 12.75, `pin-detail` 12.25, `route-pin` 12, `map-city` 11.5)`. */
const globeLine = DESIGN.match(/The globe's labels stay compact \(([^)]*)\)/);

const FLOOR = Number(floorLine?.[1]);
const CAPITALS_FLOOR = Number(floorLine?.[2]);

/** DESIGN.md's role names (`pin-detail`) as the tokens spell them (`pinDetail`). */
const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** The globe's labels at the sizes DESIGN.md names. */
const GLOBE_LABELS: Record<string, number> = Object.fromEntries(
  [...(globeLine?.[1] ?? "").matchAll(/`([a-z-]+)` (\d+(?:\.\d+)?)/g)].map((m) => [camel(m[1]!), Number(m[2])]),
);

/**
 * The roles set only in tracked capitals, under the floor for words: each of their uses is capitals (an uppercase
 * literal or `.toUpperCase()`), checked by hand in ADR-IMPL-072 — `label` (`SectionLabel`, `YOUR FARE` and the fare's
 * source in `PricePair`, `REF R-…` on a request, the system pages' `BUYBUSINESSCLASS`), `INDICATIVE FARE` and
 * `LOCAL TIME` on 04 and 13, 07's eyebrow (`LONDON TO PARIS`), 08's `BUSINESS CLASS`. A role here set in lowercase
 * words breaks DESIGN.md's floor: such a line takes a role at the floor instead.
 */
const TRACKED_CAPITALS = [
  "label",
  "routeLabel",
  "routeTimeLabel",
  "placeLabel",
  "placeTimeLabel",
  "datesEyebrow",
  "receivedTripLabel",
] as const;

type Role = { fontSize: number; letterSpacing: number };
const roles = tokens.type as Record<string, Role>;

describe("DESIGN.md states its floor", () => {
  it("names the words' floor and the tracked capitals' floor", () => {
    expect(floorLine).not.toBeNull();
    expect(FLOOR).toBeGreaterThan(CAPITALS_FLOOR);
  });

  it("names the globe's compact labels", () => {
    expect(Object.keys(GLOBE_LABELS).sort()).toEqual(["mapCity", "pin", "pinDetail", "routePin"]);
  });
});

describe("every type role keeps DESIGN.md's floor (ADR-IMPL-057)", () => {
  const capitals = new Set<string>(TRACKED_CAPITALS);

  it("sets words at the floor or above", () => {
    const under = Object.entries(roles)
      .filter(([name, role]) => !capitals.has(name) && !(name in GLOBE_LABELS) && role.fontSize < FLOOR)
      .map(([name, role]) => `${name} ${role.fontSize}`);
    expect(under).toEqual([]);
  });

  it("sets tracked capitals at their own floor, tracked", () => {
    for (const name of TRACKED_CAPITALS) {
      const role = roles[name];
      expect(role).toBeDefined();
      expect(role!.fontSize).toBeGreaterThanOrEqual(CAPITALS_FLOOR);
      expect(role!.letterSpacing).toBeGreaterThan(0);
    }
  });

  it("lists as tracked capitals only roles that need it: one at the floor is a role like any other", () => {
    for (const name of TRACKED_CAPITALS) expect(roles[name]!.fontSize).toBeLessThan(FLOOR);
  });

  it("keeps the globe's labels at the sizes DESIGN.md names", () => {
    for (const [name, size] of Object.entries(GLOBE_LABELS)) expect(roles[name]?.fontSize).toBe(size);
  });
});
