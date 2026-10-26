import { describe, expect, it } from "bun:test";
import { adjacentSwaps } from "../../src/infrastructure/airports.repo";

describe("adjacentSwaps — a city typed with two neighbouring letters crossed (ADR-IMPL-036)", () => {
  it("gives every spelling one swap away, the city among them", () => {
    expect(adjacentSwaps("pairs")).toEqual(["apirs", "piars", "paris", "paisr"]);
    expect(adjacentSwaps("toyko")).toContain("tokyo");
    expect(adjacentSwaps("lodnon")).toContain("london");
    expect(adjacentSwaps("zürihc")).toContain("zürich");
  });

  it("never swaps a letter with itself or across a space", () => {
    expect(adjacentSwaps("loon")).toEqual(["olon", "lono"]);
    expect(adjacentSwaps("new yrok")).toEqual(["enw yrok", "nwe yrok", "new ryok", "new york", "new yrko"]);
  });

  it("nothing under four letters, nothing but letters and spaces", () => {
    expect(adjacentSwaps("lon")).toEqual([]);
    expect(adjacentSwaps("a b c")).toEqual([]);
    expect(adjacentSwaps("par%s")).toEqual([]);
    expect(adjacentSwaps("pa_is")).toEqual([]);
    expect(adjacentSwaps("jfk1")).toEqual([]);
  });
});
