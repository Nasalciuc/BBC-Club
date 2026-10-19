import type { TextStyle } from "react-native";
import { baselineOffset, rn } from "../rn-type";
import { tokens } from "../tokens";

type Role = TextStyle & { fontSize: number; lineHeight: number };

/** The sheets drawn on a screen of their own, each as its image measures it (ADR-IMPL-056). */
export type ModalSheetLookName = "about" | "request";

export type ModalSheetLook = {
  /** The sheet's height on the image's 852-pt phone; a short phone shortens it as it does the sizes. */
  height: number;
  radius: number;
  grabber: { width: number; height: number; top: number; color: string };
  /**
   * The ×: its target's top and its right edge's inset from the sheet's top-right corner — in a tint circle of that
   * diameter (20), or `plain`, the × alone in a 44-pt target (06).
   */
  close: {
    diameter: number;
    top: number;
    right: number;
    glyph: { size: number; stroke: number };
    tone?: "tint" | "plain";
  };
  /** The title's baseline from the sheet's top, its pen from the left, the room it leaves the × at the right. */
  title: { role: Role; baseline: number; left: number; right: number };
  /** The content's top from the sheet's top (its first line's box), its column, the space between its blocks. */
  content: { top: number; left: number; right: number; gap: number };
  /**
   * The pinned action: its sides, its foot from the sheet's foot on a 34-pt home indicator, and how far into the bottom
   * inset that foot reaches (20: 5.2) — on another inset it stays that far into it, never closer to the edge.
   */
  footer: { left: number; right: number; bottom: number; intoInset: number };
};

/** 20's body: Inter Tight 14 on an 18.55-pt pitch (the tokens round a line height to the point). */
export const ABOUT_BODY: Role = { ...(rn(tokens.type.aboutBody) as Role), lineHeight: 18.55 };

/**
 * `about` (20), from the sheet's top edge on the 852-pt phone: 335 tall, its corners 17.5; the grabber 36.4 × 4.5 at 9.1
 * in its own light blue; the × 17.9 at 1.51 in a 30.8-pt tint circle 10.76 down and 11.1 from the right; the title's
 * baseline on 69.06, 15.1 in; the words' first baseline on 102.2, 19.5 in and 36.5 short of the right edge (where 20's
 * lines break), the paragraphs 13 apart; `Got it` 14.3 and 14.2 in, its foot 29.35 over the sheet's.
 */
export const MODAL_SHEET_LOOKS: Record<ModalSheetLookName, ModalSheetLook> = {
  about: {
    height: 335,
    radius: 17.5,
    grabber: { width: 36.4, height: 4.5, top: 9.1, color: tokens.colors.grabberAbout },
    close: { diameter: 30.8, top: 10.76, right: 11.1, glyph: { size: 17.9, stroke: 1.51 } },
    title: { role: rn(tokens.type.aboutTitle) as Role, baseline: 69.06, left: 15.1, right: 52 },
    content: { top: 102.2 - baselineOffset(ABOUT_BODY), left: 19.5, right: 36.5, gap: 13 },
    footer: { left: 14.3, right: 14.2, bottom: 29.35, intoInset: 5.2 },
  },
  /**
   * `request` (06, 22, 23), from the sheet's top edge on the 852-pt phone: 586 tall, its corners 17.7; the grabber
   * 34.6 × 4.1 at 5.35 in its own grey; the plain × 19.4 at 1.14, its middle 28 down and 26.4 from the right; the
   * title's baseline on 38.5, 20.9 in; the trip card from 52.4 — the sheet places its blocks itself, edge to edge; the pill and
   * its promise pinned, the promise's foot 35.9 over the sheet's.
   */
  request: {
    height: 585.96,
    radius: 17.7,
    grabber: { width: 34.6, height: 4.1, top: 5.35, color: tokens.colors.grabberRequest },
    close: { diameter: 44, top: 6, right: 4.44, glyph: { size: 19.4, stroke: 1.14 }, tone: "plain" },
    title: { role: rn(tokens.type.requestTitle) as Role, baseline: 38.52, left: 20.9, right: 60 },
    content: { top: 52.4, left: 0, right: 0, gap: 0 },
    footer: { left: 18.8, right: 17.9, bottom: 35.88, intoInset: -1.88 },
  },
};

/** The pinned action's foot over the sheet's: the image's, or as far into a taller bottom inset as the image's is. */
export function sheetLookFooterBottom(look: ModalSheetLook, bottomInset: number): number {
  return Math.max(look.footer.bottom, Math.round(bottomInset) - look.footer.intoInset);
}
