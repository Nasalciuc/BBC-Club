/**
 * Figma's modal sheets, measured on the 393×852 frames. Each starts at a fixed top: `tall` at 104 pt (the edit sheets,
 * the request, the calendar — 238:4561, 135:849, 325:5878), `explain` at 256 (About this fare, 135:847), `medium` at 224
 * (a question or a confirmation — 320:5704, 320:5810), `short` at 360 (one field — 320:5969).
 *
 * A tall sheet keeps its 104-pt top on any phone and takes the rest of the height; the others keep Figma's height and
 * shrink only when the phone is too short for it.
 */
export type ModalSheetSize = "tall" | "explain" | "medium" | "short";

export const MODAL_SHEET_TOP: Record<ModalSheetSize, number> = { tall: 104, explain: 256, medium: 224, short: 360 };

const FRAME_HEIGHT = 852;

/** The sheet's height on a window `windowHeight` pt tall. */
export function modalSheetHeight(size: ModalSheetSize, windowHeight: number): number {
  const room = Math.max(0, Math.round(windowHeight) - MODAL_SHEET_TOP.tall);
  if (size === "tall") return room;
  return Math.min(FRAME_HEIGHT - MODAL_SHEET_TOP[size], room);
}

/** A 28-pt headline in a 64-pt header (Phone, Delete your account?, the notifications ask); else a 20-pt title in 44. */
export function modalSheetHeadline(size: ModalSheetSize): boolean {
  return size === "medium" || size === "short";
}

/**
 * Where the content starts, from the sheet's top: 88 under a title (238:4710), 120 under a headline (320:5969), 96 for
 * About this fare (135:847). The request sheet sets its own 96 (135:849).
 */
export function modalSheetContentTop(size: ModalSheetSize): number {
  if (size === "explain") return 96;
  return modalSheetHeadline(size) ? 120 : 88;
}

/**
 * From the last action's bottom edge to the sheet's: 68 on a tall sheet (238:4710), 48 under a question (320:5810),
 * 108 under one field (320:5969). On a phone shorter than Figma's frame the sheet is shorter too, and this gap gives
 * way first, point for point, so the content keeps its room (the calendar's months). Never less than the home
 * indicator or navigation bar plus 12 pt — Figma's closest is 14 above a 34-pt home indicator.
 */
export function modalSheetFooterBottom(
  size: ModalSheetSize,
  bottomInset: number,
  windowHeight: number,
  figmaBottom?: number,
): number {
  const figma = figmaBottom ?? (size === "tall" ? 68 : size === "short" ? 108 : 48);
  const shorter = Math.max(0, FRAME_HEIGHT - MODAL_SHEET_TOP[size] - modalSheetHeight(size, windowHeight));
  return Math.max(figma - shorter, Math.round(bottomInset) + 12);
}

/** With the keyboard up the actions stand 12 pt over its keys: the home indicator is under the keyboard. */
export const MODAL_SHEET_KEYBOARD_GAP = 12;

/**
 * Where to scroll a sheet's content so a block shows whole, `margin` clear of the viewport's edges — or null when it
 * shows already. `top` is the block's distance from the viewport's top (negative above it), `offset` the content's
 * current scroll. A block below comes up to the viewport's bottom, so what stands above it stays in view; a block
 * above, or one taller than the viewport, comes down to its top.
 */
export function revealScroll(
  block: { top: number; height: number },
  viewportHeight: number,
  offset: number,
  margin = 16,
): number | null {
  const above = block.top - margin;
  const below = block.top + block.height + margin - viewportHeight;
  if (above < 0) return Math.max(0, offset + above);
  if (below > 0) return offset + Math.min(above, below);
  return null;
}
