/**
 * The globe's engine — one per mounted globe. It owns the mutable view state (rotation, zoom, timers) in its own closure,
 * builds the gesture once, runs the animation loop, and pushes finished frames into React state. React never reads any
 * of it during render, which keeps the component compilable by React Compiler with no manual memoization.
 */
import { Gesture } from "react-native-gesture-handler";
import {
  GLOBE_SPEC,
  approach,
  atOpening,
  clampTilt,
  clampZoom,
  detailFor,
  dragRotation,
  globeMode,
  projector,
  radiusFor,
  rotationAt,
  type Detail,
  type GlobeMode,
  type Rotation,
} from "./globe-logic";
import { landFor } from "./land";

/** What render draws: the land path is already computed, only when the view changed. */
export type Frame = { rotation: Rotation; zoom: number; detail: Detail; land: string };
export type GlobeSettings = { size: number; selected: string | null; reducedMotion: boolean };
type Sinks = { frame: (f: Frame) => void; clock: (t: number) => void };

/** Repaint cadence. Idle rotation is 3°/s, so 50 ms moves the centre 0.15° (under 1 px); fingers and returns get every frame. */
const CADENCE_MS: Record<GlobeMode | "gesture", number> = {
  rotating: 50,
  returning: 16,
  paused: 50,
  still: 50,
  gesture: 16,
};
/** The land path may take at most a third of the JS thread: a slow phone gets fewer frames, never a busy thread. */
const MAX_JS_SHARE = 1 / 3;

const drawLand = (size: number, rotation: Rotation, zoom: number, detail: Detail) =>
  projector(size, rotation, zoom).path(landFor(detail));

export function createGlobeEngine(initial: GlobeSettings & { holdStill: boolean }) {
  const { holdStill } = initial;
  let settings: GlobeSettings = {
    size: initial.size,
    selected: initial.selected,
    reducedMotion: initial.reducedMotion,
  };
  let rotation: Rotation = GLOBE_SPEC.opening;
  let zoom = 1;
  let interacting = false;
  let lastInteractionEnd: number | null = null;
  let rotateFrom: { t0: number; lambda0: number } | null = null;
  let gestureStart: { rotation: Rotation; zoom: number } | null = null;
  let lastStep = 0;
  let lastPaint = 0;
  let now = 0;
  let costMs = 0;
  let frame: Frame = { rotation, zoom, detail: "high", land: drawLand(initial.size, rotation, zoom, "high") };
  let sinks: Sinks | null = null;

  const modeAt = (t: number): GlobeMode =>
    globeMode({
      reducedMotion: settings.reducedMotion,
      appActive: true,
      interacting,
      selected: settings.selected,
      msSinceInteraction: lastInteractionEnd === null ? null : t - lastInteractionEnd,
      atOpening: atOpening(rotation, zoom),
    });

  /** Recompute the land only if the view changed; measure it, so the loop can slow down on a slow phone. */
  function paint(mode: GlobeMode, force = false) {
    const detail = detailFor(mode, interacting, zoom);
    const same =
      frame.detail === detail &&
      frame.zoom === zoom &&
      frame.rotation[0] === rotation[0] &&
      frame.rotation[1] === rotation[1];
    if (same && !force) return;
    const started = performance.now();
    const land = drawLand(settings.size, rotation, zoom, detail);
    costMs = performance.now() - started;
    frame = { rotation, zoom, detail, land };
    sinks?.frame(frame);
  }

  const begin = () => {
    interacting = true;
    gestureStart = { rotation, zoom };
  };
  const end = () => {
    interacting = false;
    lastInteractionEnd = now;
    gestureStart = null;
    if (holdStill) paint("still");
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(8)
    .onBegin(begin)
    .onUpdate((e) => {
      if (!gestureStart) return;
      rotation = dragRotation(gestureStart.rotation, e.translationX, e.translationY, radiusFor(settings.size, zoom));
      if (holdStill) paint("paused"); // e2e builds have no loop
    })
    .onFinalize(end);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(begin)
    .onUpdate((e) => {
      if (!gestureStart) return;
      zoom = clampZoom(gestureStart.zoom * e.scale);
      rotation = [rotation[0], clampTilt(rotation[1])];
      if (holdStill) paint("paused");
    })
    .onFinalize(end);

  function step(t: number) {
    const dt = lastStep ? Math.min(t - lastStep, 100) : 16;
    lastStep = t;
    now = t;
    const mode = modeAt(t);
    if (mode === "rotating") {
      rotateFrom ??= { t0: t, lambda0: rotation[0] }; // resume from where the globe stands
      const eased = approach({ rotation, zoom }, { rotation: [rotation[0], GLOBE_SPEC.opening[1]], zoom: 1 }, dt);
      rotation = [rotationAt(t - rotateFrom.t0, rotateFrom.lambda0), eased.rotation[1]];
      zoom = eased.zoom;
    } else {
      rotateFrom = null;
      if (mode === "returning") {
        const next = approach({ rotation, zoom }, { rotation: GLOBE_SPEC.opening, zoom: 1 }, dt);
        rotation = next.rotation;
        zoom = next.zoom;
      }
    }
    const cadence = Math.max(CADENCE_MS[interacting ? "gesture" : mode], costMs / MAX_JS_SHARE);
    if (t - lastPaint >= cadence) {
      lastPaint = t;
      paint(mode);
      if (!settings.reducedMotion) sinks?.clock(t); // halos pulse; reduced motion holds them still
    }
  }

  return {
    gesture: Gesture.Simultaneous(pan, pinch),
    initialFrame: frame,
    /** Connect React's setters; returns the disconnect. */
    attach(next: Sinks): () => void {
      sinks = next;
      return () => {
        sinks = null;
      };
    },
    update(next: GlobeSettings): void {
      const resized = next.size !== settings.size;
      settings = next;
      if (resized) paint(modeAt(now), true);
    },
    /** Run the loop while the app is active; returns the stop. Figma: pause when backgrounded. */
    run(): () => void {
      if (holdStill) return () => {};
      rotateFrom = null; // a fresh start: never jump by the time spent in the background
      lastStep = 0;
      let raf = 0;
      const loop = (t: number) => {
        step(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    },
  };
}
