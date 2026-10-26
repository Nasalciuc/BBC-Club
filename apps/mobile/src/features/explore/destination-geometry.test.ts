import { describe, expect, it } from "bun:test";
import { tokens } from "@bbc/ui/tokens";

import { FLIGHT_OPTIONS, optionsColumn } from "./destination-geometry";

describe("the flight options' measures — 13's sheet and 04's page", () => {
  it("13: inside the sheet's gutter, `Flight option` 20.4 in on 241, the card from 254.5, 16.2 from either edge", () => {
    expect(FLIGHT_OPTIONS.route).toEqual({
      inset: tokens.space.gutter,
      title: { type: tokens.type.routeOptions, baseline: 241, left: 20.4, minGap: 26.5 },
      cards: { top: 254.5, left: 16.2, right: 16.2, gap: 4.9 },
    });
    expect(tokens.space.gutter).toBe(15);
  });

  it("04: on the screen's own edge, `Flight options` 17.93 in on 245.7, the cards from 255.2, 11.2 and 11.8 in", () => {
    expect(FLIGHT_OPTIONS.page).toEqual({
      inset: 0,
      title: { type: tokens.type.placeOptions, baseline: 245.7, left: 17.93, minGap: 26.5 },
      cards: { top: 255.2, left: 11.2, right: 11.8, gap: 4.9 },
    });
  });
});

describe("optionsColumn — where a section under the flight options lines up (the landmarks, ADR-IMPL-064)", () => {
  it("04's page: the title 17.93 in, the cards 9.5 under its baseline, from 11.2 in, on the screen's own edge", () => {
    const column = optionsColumn("page");
    expect(column.inset).toBe(0);
    expect(column.title).toEqual({ type: tokens.type.placeOptions, left: 17.93 });
    expect(column.toCards).toBeCloseTo(9.5, 9);
    expect(column.cardsLeft).toBe(11.2);
  });

  it("13's sheet: inside its gutter, the title 20.4 in, the card 13.5 under its baseline, from 16.2 in", () => {
    const column = optionsColumn("route");
    expect(column.inset).toBe(15);
    expect(column.title).toEqual({ type: tokens.type.routeOptions, left: 20.4 });
    expect(column.toCards).toBeCloseTo(13.5, 9);
    expect(column.cardsLeft).toBe(16.2);
  });

  it("in both looks the cards stand under the title's baseline, the title and the cards inside the screen's edge", () => {
    for (const look of ["route", "page"] as const) {
      const column = optionsColumn(look);
      expect(column.toCards).toBeGreaterThan(0);
      expect(column.title.left).toBeGreaterThanOrEqual(column.inset);
      expect(column.cardsLeft).toBeGreaterThanOrEqual(column.inset);
    }
  });
});
