/**
 * Explore's sheet as e2e builds trace it (HomeSheet's `trace`, `useSheetTrace`; `apps/mobile/e2e/run-parity-ci.sh`
 * prints the lines): the stop the screen asked for, gorhom's index and position, and the sheet's top in the committed
 * shadow tree. Pure, so the verdict is tested.
 *
 * "Drawn" here means the committed transform: Fabric's measureInWindow reads the committed tree with its transforms
 * (react-native's DOM.cpp, `measureInWindow`), not the opacity and not what the native views show. A `drawn` line says
 * the committed transform puts the sheet where gorhom holds it; it does not say the sheet is visible.
 *
 * Every line ends with `sync=`: Reanimated's settled-props sync (FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS) as the
 * native build was compiled. ADR-IMPL-069 turns it off, and a line is read against the build it comes from (`lost`).
 */

/** Every trace line starts with it; run-parity-ci.sh greps logcat for it. */
export const SHEET_TRACE_TAG = "[HomeSheet]";

/** One look at the sheet, in points. */
export type SheetLook = {
  /** The stop the screen asked for (`HomeSheet`'s `index`). */
  index: number;
  /** gorhom's index: -1 closed, a fraction while the sheet moves between two stops. */
  sheetIndex: number;
  /** gorhom's position: the sheet's top, from the top of its container. */
  position: number;
  /** The sheet's top in the window, from the committed tree with its transforms; null when it could not be measured. */
  drawnTop: number | null;
  /** The window's height: gorhom's first frame puts the sheet this far down. */
  windowHeight: number;
  /** Reanimated's settled-props sync as the native build was compiled (`getStaticFeatureFlag`, read on the device). */
  settledSync: boolean;
};

/**
 * The top from measureInWindow's answer, or null when it measured nothing. Fabric answers an empty rect (all zeros)
 * rather than an error when the surface has no committed revision, the view is not in it, or it has no layout
 * (react-native's UIManagerBinding.cpp `measureInWindow`, DOM.cpp `measureInWindow`): read as a top, that would be 0.
 * The sheet's background always has a size, so a rect without one is no measure.
 */
export function drawnTopOf(y: number, width: number, height: number): number | null {
  if (width === 0 && height === 0) return null;
  return Number.isFinite(y) ? y : null;
}

/**
 * - `drawn`: gorhom holds the stop asked for, and the committed transform puts the sheet there.
 * - `lost`: gorhom holds the sheet open, but the committed transform puts it at or under the window's foot — gorhom's
 *   first frame, the view no longer following gorhom. design/motion.md (resting styles) reads parity's vanished sheet
 *   as this, caused by the settled-props sync. With the sync off (`sync=off`, every ADR-IMPL-069 build) that cause
 *   cannot happen, so a `lost` line there says the props were lost some other way: the fix failed and the reading is
 *   not the cause. Only a `lost` line from a build with the sync on (`sync=on`) fits the reading.
 * - `closed`: gorhom itself has the sheet closed.
 * - `moving`: between two stops.
 * - `astray`: gorhom holds another stop than the one asked for.
 * - `elsewhere`: gorhom holds the stop; the committed transform puts the sheet on screen, but not where gorhom does.
 * - `unmeasured`: gorhom holds the stop; the measure answered nothing (`drawnTopOf`).
 */
export type SheetVerdict = "drawn" | "lost" | "closed" | "moving" | "astray" | "elsewhere" | "unmeasured";

/** gorhom's index within this of a whole number is at that stop. */
const AT_STOP = 0.01;
/** Points between where gorhom puts the sheet and where it is drawn that still count as drawn there. */
const DRAWN_WITHIN = 2;

export function sheetVerdict(look: SheetLook): SheetVerdict {
  if (look.sheetIndex <= -1 + AT_STOP) return "closed";
  const stop = Math.round(look.sheetIndex);
  if (Math.abs(look.sheetIndex - stop) > AT_STOP) return "moving";
  if (look.drawnTop !== null && look.drawnTop >= look.windowHeight - 1) return "lost";
  if (stop !== look.index) return "astray";
  if (look.drawnTop === null) return "unmeasured";
  return Math.abs(look.drawnTop - look.position) <= DRAWN_WITHIN ? "drawn" : "elsewhere";
}

/** `[HomeSheet] lost index=0 sheet=0.00 position=517 top=915 window=915 sync=off` */
export function formatSheetLook(look: SheetLook): string {
  const top = look.drawnTop === null ? "?" : String(Math.round(look.drawnTop));
  return [
    SHEET_TRACE_TAG,
    sheetVerdict(look),
    `index=${look.index}`,
    `sheet=${look.sheetIndex.toFixed(2)}`,
    `position=${Math.round(look.position)}`,
    `top=${top}`,
    `window=${Math.round(look.windowHeight)}`,
    `sync=${look.settledSync ? "on" : "off"}`,
  ].join(" ");
}
