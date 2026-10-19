/**
 * Which pins on the globe carry a label, and on which side (02, 13) — pure, so it runs under `bun test`.
 *
 * A pin's tip sits on its place; the label (a city over its price, or an airport's code) stands beside the pin's head.
 * The real globe puts London and Paris eight points apart at rest: labels go one by one in priority order, each to the
 * right of its pin or else to the left, and a label that would cover another label, another pin or the screen's edge
 * is left out — the pin stays, and a pinch brings the label back.
 */
import { GLOBE_SPEC } from "./globe-logic";

export type Rect = { left: number; top: number; right: number; bottom: number };
export type LabelSide = "right" | "left";

export type PinToPlace = {
  code: string;
  /** The tip, in the same coordinates as `bounds`. */
  x: number;
  y: number;
  /** The label's lines (`London`, `$3,900`); none — a pin alone. */
  lines: readonly string[];
  /** Lower first: the chosen destination, then home, then offers by price, then the rest. */
  priority: number;
};

export type PlacedPin = {
  code: string;
  x: number;
  y: number;
  lines: readonly string[];
  /** The label's side and box; null when it is left out (or the pin has none). */
  label: { side: LabelSide; box: Rect } | null;
};

/** The label's frame (02): 7 pt either side of the words, 4 above and below, lines of 15 (`pin`, 13 × 1.15). */
export const LABEL = { padX: 7, padY: 4, line: 15, gap: 2, charWidth: 8.8, radius: 8 } as const;

/** The drop pin's box, its tip at the bottom centre; the head's centre 9 pt under its top (02). */
const PIN = { w: GLOBE_SPEC.pin.width, h: GLOBE_SPEC.pin.height, head: 9 } as const;

/** The labels follow the phone's text size up to 1.3× (DESIGN.md), their words capped there as their boxes are. */
export const MAX_LABEL_SCALE = 1.3;

/** The scale a label is drawn at for the phone's font scale: 1 to MAX_LABEL_SCALE. */
export function labelScale(fontScale: number): number {
  return Number.isFinite(fontScale) ? Math.min(MAX_LABEL_SCALE, Math.max(1, fontScale)) : 1;
}

/**
 * An estimate of the label's size before it is drawn: Inter 13 Bold runs up to 8.8 pt a character in these words; at a
 * larger text size the words, the lines and the box grow together.
 */
export function labelSize(lines: readonly string[], scale = 1): { width: number; height: number } {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
  return {
    width: Math.ceil(LABEL.padX * 2 + longest * LABEL.charWidth * scale),
    height: Math.ceil(LABEL.padY * 2 + LABEL.line * scale * lines.length),
  };
}

/** The pin's own box, from its tip. */
export function pinBox(x: number, y: number): Rect {
  return { left: x - PIN.w / 2, top: y - PIN.h, right: x + PIN.w / 2, bottom: y };
}

/** The label's box on one side, centred on the pin's head. */
export function labelBox(x: number, y: number, lines: readonly string[], side: LabelSide, scale = 1): Rect {
  const { width, height } = labelSize(lines, scale);
  const headY = y - PIN.h + PIN.head;
  const top = headY - height / 2;
  const left = side === "right" ? x + PIN.w / 2 + LABEL.gap : x - PIN.w / 2 - LABEL.gap - width;
  return { left, top, right: left + width, bottom: top + height };
}

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (a: Rect, b: Rect) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;

/**
 * `avoid`: what the labels must not cover besides one another and the pins — a button over the globe (13's back).
 * `scale`: `labelScale` of the phone's font scale.
 */
export function placeLabels(
  pins: readonly PinToPlace[],
  bounds: Rect,
  avoid: readonly Rect[] = [],
  scale = 1,
): PlacedPin[] {
  const ordered = [...pins].sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
  const pinBoxes = new Map(ordered.map((p) => [p.code, pinBox(p.x, p.y)]));
  const taken: Rect[] = [];
  const placed = new Map<string, PlacedPin>();
  for (const p of ordered) {
    let label: PlacedPin["label"] = null;
    if (p.lines.length > 0) {
      for (const side of ["right", "left"] as const) {
        const box = labelBox(p.x, p.y, p.lines, side, scale);
        const clear =
          inside(box, bounds) &&
          !taken.some((t) => overlaps(box, t)) &&
          !avoid.some((r) => overlaps(box, r)) &&
          ![...pinBoxes].some(([code, r]) => code !== p.code && overlaps(box, r));
        if (clear) {
          label = { side, box };
          taken.push(box);
          break;
        }
      }
    }
    placed.set(p.code, { code: p.code, x: p.x, y: p.y, lines: p.lines, label });
  }
  // The caller's order, so React keeps each pin where it was.
  return pins.map((p) => placed.get(p.code)!);
}

/** Lower draws first and labels first: the chosen destination, home, offers from the lowest price, then the rest. */
export function pinPriority(p: { selected: boolean; home: boolean; hasOffer: boolean; price: number }): number {
  if (p.selected) return 0;
  if (p.home) return 1;
  return (p.hasOffer ? 10 : 1_000_000) + p.price / 1_000;
}
