/**
 * Tap targets ≥ 44 pt, a smaller drawn element reaching it by its hit slop (DESIGN.md · Accessibility) — pure, so it
 * is tested without React Native. A touch lands only inside the element's holder: a screen keeps that room in its
 * holder's padding, its margins giving it back (design/components.md, `CHIP_SLOP`, `TOGGLE_SLOP`).
 */
export const MIN_TARGET = 44;

/**
 * How far an element drawn `height` pt tall reaches above and below: half its shortfall from 44 pt, never past half
 * the gap to the target above or below it (`gapAbove`, `gapBelow`, pt; unknown: no limit). Rows that touch (gap 0)
 * reach no further than their drawn pitch.
 */
export function hitSlopFor(
  height: number,
  gapAbove: number = Number.POSITIVE_INFINITY,
  gapBelow: number = Number.POSITIVE_INFINITY,
): { top: number; bottom: number } {
  // Half the shortfall each side first; what one side cannot take (a neighbour too close) goes to the other while
  // room remains, so a target with space on only one side still reaches 44 pt when that side can hold it.
  const totalNeed = Math.max(0, MIN_TARGET - height);
  const topCap = Math.max(0, gapAbove) / 2;
  const bottomCap = Math.max(0, gapBelow) / 2;
  let top = Math.min(totalNeed / 2, topCap);
  let bottom = Math.min(totalNeed / 2, bottomCap);
  let remaining = totalNeed - top - bottom;
  const topExtra = Math.min(remaining, topCap - top);
  top += topExtra;
  remaining -= topExtra;
  bottom += Math.min(remaining, bottomCap - bottom);
  return { top, bottom };
}

export type Slop = number | { top?: number; bottom?: number; left?: number; right?: number };

/**
 * A pill's target (Button): 44 pt tall by its slop when drawn smaller (`Request a quote →` 29, `Sign out` 29.3 …).
 * Never wider: a pill with words is at least 48 pt wide by its padding alone. A screen that knows its neighbours passes
 * its own (`override`).
 */
export function buttonHitSlop(height: number, override?: Slop): Slop {
  if (override !== undefined) return override;
  return { ...hitSlopFor(height), left: 0, right: 0 };
}
