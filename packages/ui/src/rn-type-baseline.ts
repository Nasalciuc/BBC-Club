/** Inter Tight's ascent and descent (hhea 1984 and 494 of 2048 units). */
const ASCENT = 0.969;
const DESCENT = 0.241;

/**
 * Where a line of type sets its baseline in its box, on a platform — pure, so it is tested without React Native
 * (`baselineOffset` reads the platform). Android and the web split the line's extra height evenly above and below the
 * glyphs, a negative one too; iOS centres them only in a line at least as tall as the font's own and otherwise keeps
 * the descent at the line's foot.
 */
export function lineBaseline(t: { fontSize: number; lineHeight: number }, os: string): number {
  const natural = (ASCENT + DESCENT) * t.fontSize;
  if (os === "ios" && t.lineHeight < natural) return t.lineHeight - DESCENT * t.fontSize;
  return (t.lineHeight - natural) / 2 + ASCENT * t.fontSize;
}
