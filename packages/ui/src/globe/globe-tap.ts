/**
 * Whose a touch on the globe is (ADR-IMPL-068) — pure, so the choice both globes make runs under `bun test`; the
 * components only hand it what was on screen and act on the answer.
 *
 * In order: a chosen route's view takes no tap (13: its ends are no targets); a pin, its label or its 44-pt target is
 * the pin's — pins keep priority, whatever else the touch could be; a touch a pin's own press already answered (the
 * press guard) is nothing more; the sky is nothing; anywhere else on the disc is the place under the finger.
 */
import { type GlobeCamera, cameraPoint, mapPoint, mapTap } from "./globe-geo";
import { type GlobeTap, type View, projector } from "./globe-logic";
import { type PlacedPin, pinAt } from "./pin-labels";

/** What a touch chose: a pin (opened as its own press opens it) or a place (for the screen to snap to a city). */
export type TapChoice = { kind: "pin"; code: string } | { kind: "place"; tap: GlobeTap };

type Placed = readonly Pick<PlacedPin, "code" | "x" | "y" | "label">[];
/** The press guard's question: did a pin's own press answer this touch already? */
type Guard = { pressedLately(): boolean };

/**
 * A tap on the drawn globe, as its engine reports it: the finger in the frame's points and the view that was on screen
 * (the frame `size` points square), with the pins placed in that view. The place is `projector`'s inverse, null off the
 * disc.
 */
export function drawnGlobeTap(
  finger: { x: number; y: number },
  seen: { size: number; view: View; placed: Placed; route: boolean },
  guard: Guard,
): TapChoice | null {
  if (seen.route) return null;
  const pin = pinAt(finger.x, finger.y, seen.placed);
  if (pin !== null) return { kind: "pin", code: pin };
  if (guard.pressedLately()) return null;
  const proj = projector(seen.size, seen.view.rotation, seen.view.zoom);
  const at = proj.invert(finger.x, finger.y);
  if (!at) return null;
  return {
    kind: "place",
    tap: {
      lng: at[0],
      lat: at[1],
      x: finger.x,
      y: finger.y,
      project: (p) => {
        const xy = proj.point([p.lng, p.lat]);
        return xy ? { x: xy[0], y: xy[1] } : null;
      },
    },
  };
}

/**
 * A press on Mapbox's map (its `onPress`: the place Mapbox resolved and the press's screen point), in the camera that
 * was on screen and with the pins placed in it.
 *
 * A press on a pin's target is the pin's here too. @rnmapbox/maps 10.3.7 routes a touch to a MarkerView by the view's
 * own frame — the pin and its label, without the slop that grows them to 44 pt (iOS's map ignores a touch whose view is
 * in a MarkerView, Android's absorbs a press inside one) — so a press in that ring reaches the map, not the pin, and the
 * map's press is the only one to answer it. Where the pin's press answers too (Android may), the guard keeps the touch
 * to one choice. Then `mapTap` decides between the sky and the place, at the camera's zoom on a map view `viewHeight`
 * points tall.
 *
 * `placed` is where `mapPoint` puts the pins (which labels fit, on which side); Mapbox shows each MarkerView where its
 * perspective camera draws the place (`cameraPoint`: 60° from the view's centre at rest, 188 pt out, not 146). The pins'
 * targets, the place under the finger and the city it snaps to are measured there, as the member sees them: on the
 * globe's outer ring, which the disc takes, a press beside a pin is the pin's — measured at `mapPoint`'s place, about
 * 40 pt nearer the centre, it snapped to the calm answer or another city.
 */
export function mapboxPress(
  press: { lng: number; lat: number; screen: { x: number; y: number } },
  seen: {
    camera: GlobeCamera;
    centre: { x: number; y: number };
    viewHeight: number;
    placed: Placed;
    route: boolean;
  },
  guard: Guard,
): TapChoice | null {
  if (seen.route) return null;
  const { camera, centre, viewHeight } = seen;
  const shown = (at: { x: number; y: number }) => cameraPoint(at, camera.zoom, centre, viewHeight);
  const pin = pinAt(
    press.screen.x,
    press.screen.y,
    seen.placed.map((p) => moved(p, shown(p))),
  );
  if (pin !== null) return { kind: "pin", code: pin };
  if (guard.pressedLately()) return null;
  const at = mapTap(press, camera, centre, viewHeight);
  if (!at) return null;
  const here = shown(at);
  // The finger and the city in one projection, the camera's, so how far apart they stand on screen is measured alike.
  return {
    kind: "place",
    tap: {
      lng: press.lng,
      lat: press.lat,
      x: here.x,
      y: here.y,
      project: (p) => {
        const there = mapPoint(p, camera, centre);
        return there ? shown(there) : null;
      },
    },
  };
}

/** A pin and its label — one MarkerView — moved whole from where `mapPoint` put the pin to where Mapbox shows it. */
function moved(p: Placed[number], to: { x: number; y: number }): Placed[number] {
  const dx = to.x - p.x;
  const dy = to.y - p.y;
  const label = p.label
    ? {
        ...p.label,
        box: {
          left: p.label.box.left + dx,
          top: p.label.box.top + dy,
          right: p.label.box.right + dx,
          bottom: p.label.box.bottom + dy,
        },
      }
    : null;
  return { code: p.code, x: to.x, y: to.y, label };
}
