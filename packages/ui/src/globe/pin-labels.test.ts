import { describe, expect, it } from "bun:test";

import { GLOBE_SPEC, projector } from "./globe-logic";
import {
  LABEL,
  MAX_LABEL_SCALE,
  ROUTE_END,
  labelBox,
  labelScale,
  labelSize,
  pinBox,
  pinPriority,
  placeLabels,
  routeEndFrame,
  type PinToPlace,
} from "./pin-labels";

const SCREEN = { left: 0, top: 0, right: 393, bottom: 400 };

describe("labelSize", () => {
  it("fits a city over its price (02): the wider of the two lines, the words 8.3 in and 11.7 short of the edge", () => {
    expect(labelSize(["London", "$3,900"])).toEqual({
      width: Math.ceil(LABEL.padLeft + LABEL.padRight + 6 * LABEL.charWidth),
      height: LABEL.padY * 2 + LABEL.line * 2,
    });
    // a short city under a longer price: the price sets the width
    expect(labelSize(["Rome", "$3,450"]).width).toBe(
      Math.ceil(LABEL.padLeft + LABEL.padRight + 6 * LABEL.detailCharWidth),
    );
    expect(labelSize(["LHR"]).height).toBe(LABEL.padY * 2 + LABEL.line);
  });

  it("grows with the phone's text size up to 1.3×, as the words in it do", () => {
    expect(labelScale(1.5)).toBe(MAX_LABEL_SCALE);
    expect(labelScale(0.85)).toBe(1);
    expect(labelScale(Number.NaN)).toBe(1);
    const big = labelSize(["London", "$3,900"], labelScale(1.3));
    expect(big.height).toBe(Math.ceil(LABEL.padY * 2 + LABEL.line * 1.3 * 2));
    expect(big.width).toBe(Math.ceil(LABEL.padLeft + LABEL.padRight + 6 * LABEL.charWidth * 1.3));
  });
});

describe("labelBox", () => {
  it("stands beside the pin's head, right or left", () => {
    const right = labelBox(100, 200, ["Paris"], "right");
    const pin = pinBox(100, 200);
    expect(right.left).toBe(pin.right + LABEL.gap);
    const left = labelBox(100, 200, ["Paris"], "left");
    expect(left.right).toBe(pin.left - LABEL.gap);
    // centred a little under the head, 9 pt under the pin's top
    expect((right.top + right.bottom) / 2).toBe(pin.top + 9 + LABEL.drop);
  });
});

describe("placeLabels", () => {
  const pin = (code: string, x: number, y: number, priority: number): PinToPlace => ({
    code,
    x,
    y,
    lines: [code, "$1"],
    priority,
  });

  it("labels a pin on its right when there is room", () => {
    const [p] = placeLabels([pin("DXB", 200, 200, 1)], SCREEN);
    expect(p?.label?.side).toBe("right");
  });

  it("moves a label to the left at the screen's right edge", () => {
    const [p] = placeLabels([pin("HND", 370, 200, 1)], SCREEN);
    expect(p?.label?.side).toBe("left");
  });

  it("gives London and Paris, eight points apart, one label each side — the cheaper first", () => {
    const p = projector(GLOBE_SPEC.frame, GLOBE_SPEC.opening);
    const at = (lng: number, lat: number) => p.point([lng, lat])!;
    const [lx, ly] = at(-0.45, 51.47);
    const [cx, cy] = at(2.55, 49.01);
    const bounds = { left: 0, top: 0, right: GLOBE_SPEC.frame, bottom: GLOBE_SPEC.frame };
    const placed = placeLabels(
      [
        {
          code: "LHR",
          x: lx,
          y: ly,
          lines: ["London", "$4,200"],
          priority: pinPriority({ selected: false, home: false, hasOffer: true, price: 4200 }),
        },
        {
          code: "CDG",
          x: cx,
          y: cy,
          lines: ["Paris", "$3,850"],
          priority: pinPriority({ selected: false, home: false, hasOffer: true, price: 3850 }),
        },
      ],
      bounds,
    );
    expect(placed.map((x) => x.code)).toEqual(["LHR", "CDG"]); // the caller's order
    expect(placed[1]?.label?.side).toBe("right");
    expect(placed[0]?.label?.side).toBe("left");
  });

  it("leaves a label out when neither side is clear, and keeps the pin", () => {
    const placed = placeLabels([pin("AAA", 200, 200, 1), pin("BBB", 200, 204, 2), pin("CCC", 200, 196, 3)], SCREEN);
    expect(placed.find((p) => p.code === "AAA")?.label).not.toBeNull();
    expect(placed.filter((p) => p.label === null).length).toBeGreaterThan(0);
    expect(placed).toHaveLength(3);
  });

  it("keeps a label off what it must avoid — the back button over the globe", () => {
    const button = { left: 100, top: 160, right: 160, bottom: 220 };
    const [p] = placeLabels([pin("JFK", 80, 200, 1)], SCREEN, [button]);
    expect(p?.label?.side).toBe("left");
  });

  it("never draws a label for a pin without words", () => {
    const [p] = placeLabels([{ code: "home", x: 100, y: 100, lines: [], priority: 1 }], SCREEN);
    expect(p?.label).toBeNull();
  });
});

describe("pinPriority", () => {
  it("orders the chosen destination, home, offers by price, then the rest", () => {
    const sel = pinPriority({ selected: true, home: false, hasOffer: false, price: 9000 });
    const home = pinPriority({ selected: false, home: true, hasOffer: false, price: 0 });
    const cheapOffer = pinPriority({ selected: false, home: false, hasOffer: true, price: 3000 });
    const dearOffer = pinPriority({ selected: false, home: false, hasOffer: true, price: 9000 });
    const plain = pinPriority({ selected: false, home: false, hasOffer: false, price: 100 });
    expect([sel, home, cheapOffer, dearOffer, plain]).toEqual(
      [...[sel, home, cheapOffer, dearOffer, plain]].sort((a, b) => a - b),
    );
  });
});

describe("routeEndFrame (13)", () => {
  it("holds the glow round the pin's head and the code's box, with the tip where the place is", () => {
    const origin = routeEndFrame("JFK", "origin");
    // The departure's box starts 2.3 right of the tip and 0.5 above it; the glow reaches 11 pt round the head.
    expect(origin.tip.x).toBeCloseTo(ROUTE_END.halo, 6);
    // Three letters at the code's width for `route-pin` (ADR-IMPL-057).
    expect(origin.width).toBeCloseTo(
      ROUTE_END.halo + ROUTE_END.origin.dx + 2 * ROUTE_END.label.padX + 3 * ROUTE_END.label.charWidth,
      6,
    );
    const dest = routeEndFrame("LHR", "destination");
    // The arrival's box stands 5.1 above the tip: the glow, 5.9 + 11 above it, sets the frame's top.
    expect(dest.tip.y).toBeCloseTo(ROUTE_END.pin.height - ROUTE_END.pin.head + ROUTE_END.halo, 6);
    expect(dest.height).toBeGreaterThan(ROUTE_END.label.height);
  });
});
