import { describe, expect, it } from "bun:test";
import type { ViewStyle } from "react-native";

import { tokens } from "../tokens";
import { lookRowFlex } from "./look-row-flex";

const GAP = tokens.space.xs;

/**
 * The row's one line as Yoga lays it out, for its two items: the label's column (`labelLeft` in from the card's left
 * edge) and the value. React Native's `flex: n > 0` is grow n, shrink 0, basis 0; otherwise the basis is the content's
 * own width. Free room goes to the items that grow; missing room is taken from those that shrink, by shrink × basis.
 * `inner` is the row less its right padding (the look's `valueRight`): what the value's `55%` is of.
 */
function layRow(
  inner: number,
  labelLeft: number,
  column: { style: ViewStyle; content: number },
  value: { style: ViewStyle; content: number },
): { column: number; value: number } {
  const items = [
    { ...column, margin: labelLeft },
    { ...value, margin: typeof value.style.marginLeft === "number" ? value.style.marginLeft : 0 },
  ].map(({ style, content, margin }) => {
    const flex = style.flex ?? 0;
    const max = typeof style.maxWidth === "string" ? (parseFloat(style.maxWidth) / 100) * inner : Infinity;
    const basis = typeof style.flexBasis === "number" ? style.flexBasis : flex > 0 ? 0 : content;
    return {
      grow: style.flexGrow ?? (flex > 0 ? flex : 0),
      shrink: style.flexShrink ?? 0,
      basis: Math.min(basis, max),
      max,
      margin,
    };
  });
  const free = inner - items.reduce((sum, i) => sum + i.basis + i.margin, 0);
  const grow = items.reduce((sum, i) => sum + i.grow, 0);
  const shrink = items.reduce((sum, i) => sum + i.shrink * i.basis, 0);
  const [c, v] = items.map((i) => {
    if (free >= 0) return Math.min(i.max, grow > 0 ? i.basis + (free * i.grow) / grow : i.basis);
    return shrink > 0 ? i.basis + (free * i.shrink * i.basis) / shrink : i.basis;
  });
  return { column: c!, value: v! };
}

/**
 * Widths in pt, measured from the app's face (the bundled Inter Tight's advance widths) at each look's roles
 * (`editRow` / `editValue` 14.75 / 14.5, `settingsRow` / `settingsValue` 15.5 / 15.25), at 1.0× and 1.3× text, on a
 * 393-pt phone: Edit profile's card 362.8 wide, its value ending 31.3 from the right, its words 52.2 in; Settings' card
 * 363.4, 30.4, 52.4.
 */
const EDIT = { inner: 362.8 - 31.3, labelLeft: 52.2 };
const SETTINGS = { inner: 363.4 - 30.4, labelLeft: 52.4 };

function row(at: typeof EDIT, label: number, value: number, subtitle = false) {
  const flex = lookRowFlex({ value: true, subtitle });
  return layRow(at.inner, at.labelLeft, { style: flex.text, content: label }, { style: flex.value, content: value });
}

describe("a look row's label and value share its line — nothing is cut (DESIGN.md, Layout)", () => {
  it("at 1.3× text, `Home airport` keeps its line beside `San Francisco (SFO)`; the value wraps instead", () => {
    const { column, value } = row(EDIT, 111.5, 176.9);
    expect(column).toBeGreaterThanOrEqual(111.5);
    // What is left, `xs` clear of the label: the value takes two lines and the row grows.
    expect(value).toBeCloseTo(EDIT.inner - EDIT.labelLeft - 111.5 - GAP, 5);
    expect(value).toBeLessThan(176.9);
  });

  it("a member's own name longer than 55% of the row wraps; its label keeps its line", () => {
    const { column, value } = row(EDIT, 39, 228.6);
    expect(column).toBeGreaterThanOrEqual(39);
    expect(value).toBeCloseTo(0.55 * EDIT.inner, 5);
  });

  it("where both fit, as the images draw them, the value keeps its one line and ends where the screen ends it", () => {
    for (const [label, value] of [
      [85.8, 136.1], // 36 at 1.0×: Home airport · San Francisco (SFO)
      [111.5, 135.6], // 36 at 1.3×: Home airport · New York (JFK)
      [39, 65.4], // 36 at 1.0×: Name · a short name
    ] as const) {
      const laid = row(EDIT, label, value);
      expect(laid.value).toBe(value);
      expect(EDIT.labelLeft + laid.column + GAP + laid.value).toBeCloseTo(EDIT.inner, 5);
    }
  });

  it("a row with a subtitle (34's Notifications) is laid out as before: the column takes what the value leaves", () => {
    const { column, value } = row(SETTINGS, 86.2, 84.6, true);
    expect(value).toBe(84.6);
    expect(column).toBeCloseTo(SETTINGS.inner - SETTINGS.labelLeft - 84.6, 5);
    expect(lookRowFlex({ value: true, subtitle: true }).value.marginLeft ?? 0).toBe(0);
  });

  it("without a value the column takes the row", () => {
    expect(lookRowFlex({ value: false, subtitle: false }).text).toEqual({ flex: 1 });
  });
});
