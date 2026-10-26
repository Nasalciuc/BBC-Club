/**
 * The globe's engine — one per mounted globe. It owns the mutable view state (rotation, zoom, timers) in its own closure,
 * builds the gesture once, runs the animation loop, and pushes finished frames into React state. React never reads any
 * of it during render, which keeps the component compilable by React Compiler with no manual memoization.
 */
import { Gesture } from "react-native-gesture-handler";
import {
  GLOBE_SPEC,
  OPENING_VIEW,
  PAN_START,
  TAP,
  approach,
  atView,
  detailFor,
  globeMode,
  panBy,
  pinchBy,
  projector,
  rotationAt,
  routeView,
  touchesAfter,
  type Detail,
  type GlobeMode,
  type LonLat,
  type Rotation,
  type View,
} from "./globe-logic";
import { landFor } from "./land";

/** What render draws: the land path is already computed, only when the view changed. */
export type Frame = { rotation: Rotation; zoom: number; detail: Detail; land: string };
/** A chosen route, home to destination (13); home is null when the member has none yet. */
export type Route = { from: LonLat | null; to: LonLat };
export type GlobeSettings = {
  size: number;
  selected: string | null;
  route: Route | null;
  reducedMotion: boolean;
  /** ADR-IMPL-068: a tap off the pins has somewhere to go (the screen has a list to snap to). Without it the globe has
   *  no tap at all — its pan and pinch alone, as before. */
  tap: boolean;
};
type Sinks = { frame: (f: Frame) => void };
/** A tap on the globe (not a drag, not a pinch): where the finger lifted, in the frame's points, and the view that was
 *  on screen then — the last frame painted. */
export type TapSink = (x: number, y: number, view: View) => void;

/** Repaint cadence. Idle rotation is 3°/s, so 50 ms moves the centre 0.15° (under 1 px); fingers and framing every frame. */
const CADENCE_MS: Record<GlobeMode | "gesture", number> = {
  rotating: 50,
  framing: 16,
  paused: 50,
  still: 50,
  gesture: 16,
};
/** The land path may take at most a third of the JS thread: a slow phone gets fewer frames, never a busy thread. */
const MAX_JS_SHARE = 1 / 3;

const drawLand = (size: number, rotation: Rotation, zoom: number, detail: Detail) =>
  projector(size, rotation, zoom).path(landFor(detail));

const sameRoute = (a: Route | null, b: Route | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.to[0] === b.to[0] &&
    a.to[1] === b.to[1] &&
    (a.from === b.from || (a.from !== null && b.from !== null && a.from[0] === b.from[0] && a.from[1] === b.from[1])));

export function createGlobeEngine(initial: GlobeSettings & { holdStill: boolean }) {
  const { holdStill } = initial;
  let settings: GlobeSettings = { ...initial };
  /** Where the selection wants the globe: the route framed (13), or nothing — the turn resumes from where it stands. */
  let target: View | null = initial.route ? routeView(initial.route.from, initial.route.to) : null;
  let rotation: Rotation = target?.rotation ?? GLOBE_SPEC.opening;
  let zoom = target?.zoom ?? 1;
  let interacting = false;
  let lastInteractionEnd: number | null = null;
  let rotateFrom: { t0: number; lambda0: number } | null = null;
  let touches = 0; // active gestures: pan and pinch run together
  let lastStep = 0;
  let lastPaint = 0;
  let now = 0;
  let costMs = 0;
  let frame: Frame = { rotation, zoom, detail: "high", land: drawLand(initial.size, rotation, zoom, "high") };
  let sinks: Sinks | null = null;
  let tapSink: TapSink | null = null;

  const modeAt = (t: number): GlobeMode =>
    globeMode({
      reducedMotion: settings.reducedMotion,
      appActive: true, // the component stops the loop in the background and while the globe is covered
      interacting,
      selected: settings.selected,
      msSinceInteraction: lastInteractionEnd === null ? null : t - lastInteractionEnd,
      atTarget: target === null || atView({ rotation, zoom }, target),
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

  // Pan and pinch run together: each applies only its own change since its last event (panBy, pinchBy), and the globe
  // stays touched until the last of them ends — one gesture ending never freezes, rebases or replays the other.
  const begin = () => {
    touches = touchesAfter(touches, "begin");
    interacting = true;
  };
  const end = () => {
    touches = touchesAfter(touches, "end");
    if (touches > 0) return;
    interacting = false;
    lastInteractionEnd = now;
    // A route moved by hand stays where the member left it until another is chosen.
    if (target) target = { rotation, zoom };
    if (holdStill) paint("still");
  };
  // One pan and one pinch for each of the two gestures below: a gesture object belongs to one detector's set.
  const pan = () =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(PAN_START)
      .onBegin(begin)
      .onChange((e) => {
        ({ rotation, zoom } = panBy({ rotation, zoom }, e.changeX, e.changeY, settings.size));
        if (holdStill) paint("paused"); // e2e builds have no loop
      })
      .onFinalize(end);
  const pinch = () =>
    Gesture.Pinch()
      .runOnJS(true)
      .onBegin(begin)
      .onChange((e) => {
        // A long route frames below the rest size: the pinch starts from there, never jumping up to it.
        const floor = settings.route ? GLOBE_SPEC.routeZoom.min : GLOBE_SPEC.zoom.min;
        ({ rotation, zoom } = pinchBy({ rotation, zoom }, e.scaleChange, floor));
        if (holdStill) paint("paused");
      })
      .onFinalize(end);
  // ADR-IMPL-068: a tap anywhere on the globe. It may move less than the pan's start and must lift within 500 ms, and it
  // races the pan and the pinch: a drag starts the pan, which cancels it — a drag never fires a tap. The pan's own
  // begin and end already count the touch, so the turn pauses for a tap too.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(TAP.maxDistance)
    .maxDuration(TAP.maxDurationMs)
    .onEnd((e, success) => {
      if (success) tapSink?.(e.x, e.y, { rotation: frame.rotation, zoom: frame.zoom });
    });
  // Built once each, so a re-render hands the detector the same gesture; it changes only when a tap gains or loses
  // somewhere to go (`settings.tap`). Without one the globe is touched as it was before the tap: pan and pinch alone,
  // nothing to cancel a pin's own press.
  const gestures = {
    plain: Gesture.Simultaneous(pan(), pinch()),
    tap: Gesture.Race(Gesture.Simultaneous(pan(), pinch()), tap),
  };

  function step(t: number) {
    const dt = lastStep ? Math.min(t - lastStep, 100) : 16;
    lastStep = t;
    now = t;
    const mode = modeAt(t);
    if (mode === "rotating") {
      rotateFrom ??= { t0: t, lambda0: rotation[0] }; // resume from where the globe stands
      // Back to the rest size and latitude as it turns.
      const eased = approach({ rotation, zoom }, { rotation: [rotation[0], OPENING_VIEW.rotation[1]], zoom: 1 }, dt);
      rotation = [rotationAt(t - rotateFrom.t0, rotateFrom.lambda0), eased.rotation[1]];
      zoom = eased.zoom;
    } else {
      rotateFrom = null;
      if (mode === "framing" && target) {
        const next = approach({ rotation, zoom }, target, dt);
        rotation = next.rotation;
        zoom = next.zoom;
      }
    }
    const cadence = Math.max(CADENCE_MS[interacting ? "gesture" : mode], costMs / MAX_JS_SHARE);
    if (t - lastPaint >= cadence) {
      lastPaint = t;
      paint(mode);
    }
  }

  return {
    /** The gesture for the detector: with the tap only while a tap off the pins has somewhere to go. */
    gesture(withTap: boolean) {
      return withTap ? gestures.tap : gestures.plain;
    },
    initialFrame: frame,
    /** Connect React's setter; returns the disconnect. */
    attach(next: Sinks): () => void {
      sinks = next;
      return () => {
        sinks = null;
      };
    },
    /** Connect the tap's handler (the component's, which changes with its props); returns the disconnect. */
    onTap(handler: TapSink): () => void {
      tapSink = handler;
      return () => {
        if (tapSink === handler) tapSink = null;
      };
    },
    update(next: GlobeSettings): void {
      const resized = next.size !== settings.size;
      const rerouted = !sameRoute(next.route, settings.route) || next.selected !== settings.selected;
      // The detector swapped one gesture for the other and dropped the first: a pan or pinch it was running never
      // reports its end, so the touch it counted is over.
      if (next.tap !== settings.tap && touches > 0) {
        touches = 0;
        interacting = false;
        lastInteractionEnd = now;
      }
      settings = next;
      if (rerouted) {
        target = next.route ? routeView(next.route.from, next.route.to) : null;
        lastInteractionEnd = null;
        // No flight under reduced motion, nor in e2e builds (no loop): the route is framed at once.
        if (target && (next.reducedMotion || holdStill)) {
          rotation = target.rotation;
          zoom = target.zoom;
          paint("still", true);
          return;
        }
        // Back at rest with reduced motion or no loop: the opening view, at once.
        if (!target && (next.reducedMotion || holdStill)) {
          rotation = OPENING_VIEW.rotation;
          zoom = OPENING_VIEW.zoom;
          paint("still", true);
          return;
        }
      }
      if (resized) paint(modeAt(now), true);
    },
    /** Run the loop while the app is active; returns the stop. */
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
