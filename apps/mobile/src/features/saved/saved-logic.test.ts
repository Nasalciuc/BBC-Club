import { describe, expect, it } from "bun:test";

import { isSaved, parseSaved, toggled } from "./saved-logic";

const at = new Date("2026-10-19T10:00:00Z");

describe("saved — a fare's heart, a destination's bookmark, on the phone", () => {
  it("saves first, unsaves on a second press", () => {
    const one = toggled([], "fare", "f1", at);
    expect(one).toEqual([{ kind: "fare", id: "f1", at: at.toISOString() }]);
    const two = toggled(one, "destination", "LHR", at);
    expect(two.map((s) => s.id)).toEqual(["LHR", "f1"]);
    expect(isSaved(two, "fare", "f1")).toBe(true);
    expect(isSaved(toggled(two, "fare", "f1", at), "fare", "f1")).toBe(false);
  });
  it("a fare and a destination with the same id are two things", () => {
    const list = toggled(toggled([], "fare", "LHR", at), "destination", "LHR", at);
    expect(list).toHaveLength(2);
  });
  it("reads what it wrote, and nothing from what it cannot read", () => {
    const list = toggled([], "fare", "f1", at);
    expect(parseSaved(JSON.stringify(list))).toEqual(list);
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved(JSON.stringify({ kind: "fare" }))).toEqual([]);
    expect(
      parseSaved(
        JSON.stringify([
          { kind: "trip", id: "x", at: "" },
          { kind: "fare", id: "", at: "" },
        ]),
      ),
    ).toEqual([]);
    expect(parseSaved(undefined)).toEqual([]);
  });
  it("keeps one of each, and the newest 200", () => {
    const dup = [
      { kind: "fare", id: "a", at: "1" },
      { kind: "fare", id: "a", at: "2" },
    ];
    expect(parseSaved(JSON.stringify(dup))).toHaveLength(1);
    let list = parseSaved(null);
    for (let i = 0; i < 205; i++) list = toggled(list, "fare", `f${i}`, at);
    expect(list).toHaveLength(200);
    expect(list[0]?.id).toBe("f204");
  });
});
