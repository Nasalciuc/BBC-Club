/**
 * Explore's sheet as e2e builds trace it (HomeSheet's `useSheetTrace`; `apps/mobile/e2e/run-parity-ci.sh` prints the
 * lines): the stop the screen asked for, gorhom's index and position, and where the sheet is drawn. Pure, so the
 * verdict is tested.
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
  /** The sheet's top as drawn, in the window; null when it could not be measured. */
  drawnTop: number | null;
  /** The window's height: gorhom's first frame draws the sheet this far down. */
  windowHeight: number;
};

/**
 * - `drawn`: gorhom holds the stop asked for, and the sheet is drawn there.
 * - `lost`: gorhom holds the sheet open, but it is drawn at or under the window's foot — gorhom's first frame, the drawn
 *   view no longer following gorhom (parity's vanished sheet; design/motion.md, resting styles).
 * - `closed`: gorhom itself has the sheet closed.
 * - `moving`: between two stops.
 * - `astray`: gorhom holds another stop than the one asked for.
 * - `elsewhere`: gorhom holds the stop; the sheet is drawn on screen, but not where gorhom puts it.
 * - `unmeasured`: gorhom holds the stop; where it is drawn is unknown.
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

/** `[HomeSheet] lost index=0 sheet=0.00 position=517 top=915 window=915` */
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
  ].join(" ");
}
