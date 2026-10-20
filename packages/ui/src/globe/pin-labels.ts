/**
 * Which pins on the globe carry a label, and on which side (02, 13) — pure, so it runs under `bun test`.
 *
 * A pin's tip sits on its place; the label (a city over its price, or an airport's code) stands beside the pin's head.
 * The real globe puts London and Paris eight points apart at rest: labels go one by one in priority order, each to the
 * right of its pin or else to the left, and a label that would cover another label, another pin or the screen's edge
 * is left out — the pin stays, and a pinch brings the label back.
 */
import { tokens } from "../tokens";
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

/** The sizes 02's labels were measured at (`pin` Bold, `pin-detail`): the words' widths follow the roles from there. */
const DRAWN = { pin: 11.28, detail: 10.75 } as const;

/**
 * The label's frame (02): the words 8.3 pt in, 11.7 before its right edge; 2.5 above and below the lines (`pin`'s
 * line height); 4 from the pin, radius 9, centred 2.5 under the pin's head. The city runs up to 6.7 pt a character in
 * `pin` Bold at 02's size, the price 5.4 in `pin-detail` — both grow with their roles (ADR-IMPL-057).
 */
export const LABEL = {
  padLeft: 8.3,
  padRight: 11.7,
  padY: 2.5,
  line: tokens.type.pin.lineHeight,
  gap: 4,
  charWidth: (6.7 * tokens.type.pin.fontSize) / DRAWN.pin,
  detailCharWidth: (5.4 * tokens.type.pinDetail.fontSize) / DRAWN.detail,
  radius: 9,
  drop: 2.5,
} as const;

/** The drop pin's box, its tip at the bottom centre; the head's centre 9 pt under its top (02). */
const PIN = { w: GLOBE_SPEC.pin.width, h: GLOBE_SPEC.pin.height, head: 9 } as const;

/** The labels follow the phone's text size up to 1.3× (DESIGN.md), their words capped there as their boxes are. */
export const MAX_LABEL_SCALE = 1.3;

/** The scale a label is drawn at for the phone's font scale: 1 to MAX_LABEL_SCALE. */
export function labelScale(fontScale: number): number {
  return Number.isFinite(fontScale) ? Math.min(MAX_LABEL_SCALE, Math.max(1, fontScale)) : 1;
}

/**
 * An estimate of the label's size before it is drawn, from its lines' characters (the first in `pin` Bold, the rest in
 * `pin-detail`); at a larger text size the words, the lines and the box grow together.
 */
export function labelSize(lines: readonly string[], scale = 1): { width: number; height: number } {
  const widest = lines.reduce(
    (w, l, i) => Math.max(w, l.length * (i === 0 ? LABEL.charWidth : LABEL.detailCharWidth)),
    0,
  );
  return {
    width: Math.ceil(LABEL.padLeft + LABEL.padRight + widest * scale),
    height: Math.ceil(LABEL.padY * 2 + LABEL.line * scale * lines.length),
  };
}

/** The pin's own box, from its tip. */
export function pinBox(x: number, y: number): Rect {
  return { left: x - PIN.w / 2, top: y - PIN.h, right: x + PIN.w / 2, bottom: y };
}

/** The label's box on one side, centred a little under the pin's head (02). */
export function labelBox(x: number, y: number, lines: readonly string[], side: LabelSide, scale = 1): Rect {
  const { width, height } = labelSize(lines, scale);
  const headY = y - PIN.h + PIN.head;
  const top = headY + LABEL.drop - height / 2;
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

/**
 * 13: a chosen route's two ends — a small navy drop pin, 8.6 × 10.2 with its tip on the airport and a white edge, in a
 * soft white glow 11 pt round its head; the code in a white box on a navy hairline, 16.1 tall, 5.4 either side of the
 * words, radius 5. The departure's box stands right of its tip and just under it (the route leaves it upward), the
 * arrival's right of its head. The box and the code's width grow with `route-pin` from 13's 9.84 pt (ADR-IMPL-057).
 */
const routeGrow = tokens.type.routePin.fontSize / 9.84;
export const ROUTE_END = {
  pin: { width: 8.6, height: 10.2, head: 4.3 },
  halo: 11,
  label: { padX: 5.4, height: 16.1 * routeGrow, radius: 5, border: 0.7, charWidth: 6 * routeGrow },
  origin: { dx: 2.3, dy: -0.5 },
  destination: { dx: 6.9, dy: -5.1 },
} as const;

export type RouteEndKind = "origin" | "destination";

/** A route end's whole box — the glow and the label — and where the tip sits in it: a MarkerView anchors on the tip. */
export function routeEndFrame(code: string, end: RouteEndKind) {
  const at = ROUTE_END[end];
  const headY = -ROUTE_END.pin.height + ROUTE_END.pin.head;
  const width = 2 * ROUTE_END.label.padX + code.length * ROUTE_END.label.charWidth;
  const left = Math.min(-ROUTE_END.halo, at.dx);
  const right = Math.max(ROUTE_END.halo, at.dx + width);
  const top = Math.min(headY - ROUTE_END.halo, at.dy);
  const bottom = Math.max(headY + ROUTE_END.halo, at.dy + ROUTE_END.label.height);
  return { width: right - left, height: bottom - top, tip: { x: -left, y: -top } };
}

/** Lower draws first and labels first: the chosen destination, home, offers from the lowest price, then the rest. */
export function pinPriority(p: { selected: boolean; home: boolean; hasOffer: boolean; price: number }): number {
  if (p.selected) return 0;
  if (p.home) return 1;
  return (p.hasOffer ? 10 : 1_000_000) + p.price / 1_000;
}
