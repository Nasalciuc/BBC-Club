/**
 * ADR-IMPL-068: "0 taps during a drag", as far as a test without a phone can pin it — the drawn globe's gestures exactly
 * as React Native Gesture Handler is handed them. The library's own builders run here without its native module (they
 * only record a configuration), so what is asserted is what GestureDetector receives on a phone: a Tap that fails where
 * the pan starts, raced against the pan and the pinch, and no Tap at all while a tap has nowhere to go. That the race
 * cancels the tap when a drag starts is the library's, checked on a phone (the ADR's checklist).
 */
import { describe, expect, it, mock } from "bun:test";

type Built = {
  handlerName?: string;
  config: { [key: string]: unknown; simultaneousWith?: Built[]; requireToFail?: Built[] };
  handlers: { onEnd?: (event: { x: number; y: number }, success: boolean) => void };
  gestures: Built[];
  prepare(): void;
};
type GestureClass = abstract new (...args: never[]) => unknown;

// Paths held in variables: the library ships no types for its built modules, and the test needs none from them.
const BUILDERS = "react-native-gesture-handler/lib/module/handlers/gestures/gestureObjects.js";
const COMPOSITION = "react-native-gesture-handler/lib/module/handlers/gestures/gestureComposition.js";
const { GestureObjects } = (await import(BUILDERS)) as { GestureObjects: unknown };
const { ComposedGesture, SimultaneousGesture } = (await import(COMPOSITION)) as {
  ComposedGesture: GestureClass;
  SimultaneousGesture: GestureClass;
};
mock.module("react-native-gesture-handler", () => ({ Gesture: GestureObjects }));

const { createGlobeEngine } = await import("./globe-engine");
const { GLOBE_SPEC, PAN_START, TAP } = await import("./globe-logic");

const engine = (tap: boolean) =>
  createGlobeEngine({
    size: GLOBE_SPEC.frame,
    selected: null,
    route: null,
    reducedMotion: false,
    holdStill: true,
    tap,
  });
const built = (g: unknown) => g as Built;
const names = (g: Built) => g.gestures.map((x) => x.handlerName);

describe("the drawn globe's gestures (ADR-IMPL-068)", () => {
  it("without a list to snap to, no tap at all: the pan and the pinch together, as before", () => {
    const g = built(engine(false).gesture(false));
    expect(g).toBeInstanceOf(SimultaneousGesture);
    expect(names(g)).toEqual(["PanGestureHandler", "PinchGestureHandler"]);
  });

  it("with one, a tap raced against the pan and the pinch — a race, neither simultaneous nor waiting", () => {
    const g = built(engine(true).gesture(true));
    // Gesture.Race is the plain composition; Simultaneous and Exclusive are its subclasses.
    expect(g.constructor).toBe(ComposedGesture);
    const [group, tap] = g.gestures;
    expect(group).toBeInstanceOf(SimultaneousGesture);
    expect(names(group!)).toEqual(["PanGestureHandler", "PinchGestureHandler"]);
    expect(tap!.handlerName).toBe("TapGestureHandler");

    // Prepared as the detector prepares it: the tap runs alongside nothing and waits for nothing, so the first of the
    // two to activate cancels the other; the pan and the pinch still run together.
    g.prepare();
    expect(tap!.config.simultaneousWith ?? []).toEqual([]);
    expect(tap!.config.requireToFail ?? []).toEqual([]);
    const [pan, pinch] = group!.gestures;
    expect(pan!.config.simultaneousWith).toContain(pinch!);
    expect(pinch!.config.simultaneousWith).toContain(pan!);
  });

  it("the tap fails where the pan starts — 8 pt — and must lift within 500 ms", () => {
    const g = built(engine(true).gesture(true));
    const [group, tap] = g.gestures;
    const pan = group!.gestures[0]!;
    expect(TAP.maxDistance).toBe(8);
    expect(tap!.config.maxDist).toBe(TAP.maxDistance);
    expect(pan.config.minDist).toBe(PAN_START);
    expect(PAN_START).toBe(TAP.maxDistance);
    expect(tap!.config.maxDurationMs).toBe(TAP.maxDurationMs);
    expect(TAP.maxDurationMs).toBe(500);
    // Every handler runs on the JS thread, where the engine's state lives.
    for (const h of [tap!, ...group!.gestures]) expect(h.config.runOnJS).toBe(true);
  });

  it("only a tap that succeeded reaches the globe, with the view that was on screen", () => {
    const e = engine(true);
    const tap = built(e.gesture(true)).gestures[1]!;
    const seen: unknown[] = [];
    const off = e.onTap((x, y, view) => seen.push([x, y, view]));
    tap.handlers.onEnd!({ x: 10, y: 20 }, false); // cancelled: a drag started, or the finger stayed down
    expect(seen).toEqual([]);
    tap.handlers.onEnd!({ x: 10, y: 20 }, true);
    expect(seen).toEqual([[10, 20, { rotation: e.initialFrame.rotation, zoom: e.initialFrame.zoom }]]);
    off();
    tap.handlers.onEnd!({ x: 10, y: 20 }, true);
    expect(seen).toHaveLength(1);
  });

  it("the same gesture on every render; the other only when a tap gains or loses somewhere to go", () => {
    const e = engine(false);
    expect(e.gesture(false)).toBe(e.gesture(false));
    expect(e.gesture(true)).toBe(e.gesture(true));
    expect(e.gesture(true)).not.toBe(e.gesture(false));
    // Each has its own pan and pinch: a gesture object belongs to one detector's set.
    const plainPan = built(e.gesture(false)).gestures[0];
    const racedPan = built(e.gesture(true)).gestures[0]!.gestures[0];
    expect(racedPan).not.toBe(plainPan);
  });
});
