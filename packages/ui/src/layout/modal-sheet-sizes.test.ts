import { describe, expect, it } from "bun:test";

import {
  MODAL_SHEET_TOP,
  modalSheetContentTop,
  modalSheetFooterBottom,
  modalSheetHeadline,
  modalSheetHeight,
  revealScroll,
} from "./modal-sheet-sizes";

describe("modalSheetHeight", () => {
  it("is Figma's sheet on the 852-pt frame: 748 / 596 / 628 / 492", () => {
    expect(modalSheetHeight("tall", 852)).toBe(748);
    expect(modalSheetHeight("explain", 852)).toBe(596);
    expect(modalSheetHeight("medium", 852)).toBe(628);
    expect(modalSheetHeight("short", 852)).toBe(492);
  });

  it("keeps a tall sheet's 104-pt top on a taller phone, and the others' height", () => {
    expect(modalSheetHeight("tall", 932)).toBe(932 - MODAL_SHEET_TOP.tall);
    expect(modalSheetHeight("medium", 932)).toBe(628);
    expect(modalSheetHeight("short", 932)).toBe(492);
  });

  it("never runs above the 104-pt top on a short phone", () => {
    expect(modalSheetHeight("tall", 667)).toBe(563);
    expect(modalSheetHeight("medium", 667)).toBe(563);
    expect(modalSheetHeight("short", 667)).toBe(492);
    expect(modalSheetHeight("tall", 50)).toBe(0);
  });
});

describe("the header, the content and the actions", () => {
  it("puts a headline over a question or one field, a title over the rest", () => {
    expect(modalSheetHeadline("medium")).toBe(true);
    expect(modalSheetHeadline("short")).toBe(true);
    expect(modalSheetHeadline("tall")).toBe(false);
    expect(modalSheetHeadline("explain")).toBe(false);
  });

  it("starts the content where Figma does: 88 under a title, 120 under a headline, 96 for About this fare", () => {
    expect(modalSheetContentTop("tall")).toBe(88);
    expect(modalSheetContentTop("medium")).toBe(120);
    expect(modalSheetContentTop("short")).toBe(120);
    expect(modalSheetContentTop("explain")).toBe(96);
  });

  it("keeps the last action Figma's distance from the bottom, and clear of the home indicator", () => {
    expect(modalSheetFooterBottom("tall", 34, 852)).toBe(68);
    expect(modalSheetFooterBottom("medium", 34, 852)).toBe(48);
    expect(modalSheetFooterBottom("short", 0, 852)).toBe(108);
    expect(modalSheetFooterBottom("tall", 0, 852, 50)).toBe(50);
    expect(modalSheetFooterBottom("tall", 34, 852, 50)).toBe(50);
    // A 48-pt Android navigation bar: the action stays 12 pt above it.
    expect(modalSheetFooterBottom("medium", 48, 852)).toBe(60);
    // A taller phone: the sheet grows, the gap stays Figma's.
    expect(modalSheetFooterBottom("tall", 34, 932)).toBe(68);
    expect(modalSheetFooterBottom("short", 34, 932)).toBe(108);
  });

  it("gives up that gap first on a shorter phone, point for point, so the content keeps its room", () => {
    // The calendar's 102 (325:5878) on a 800-pt phone: the sheet is 52 pt shorter, the gap too.
    expect(modalSheetFooterBottom("tall", 34, 800, 102)).toBe(50);
    // An iPhone SE (667 pt, no home indicator) and a 640-dp Android with its 48-dp bar: 12 pt over the edge or bar.
    expect(modalSheetFooterBottom("tall", 0, 667, 102)).toBe(12);
    expect(modalSheetFooterBottom("tall", 48, 640, 102)).toBe(60);
    expect(modalSheetFooterBottom("tall", 0, 667)).toBe(12);
    // A question keeps Figma's 628 pt down to a 732-pt window; on the SE it is 65 pt shorter.
    expect(modalSheetFooterBottom("medium", 0, 732)).toBe(48);
    expect(modalSheetFooterBottom("medium", 0, 667)).toBe(12);
    // One field keeps its 492 pt on the SE: its 108 stays.
    expect(modalSheetFooterBottom("short", 0, 667)).toBe(108);
  });
});

describe("revealScroll", () => {
  it("leaves a block that shows whole, 16 pt clear of the edges", () => {
    expect(revealScroll({ top: 100, height: 20 }, 300, 0)).toBeNull();
    expect(revealScroll({ top: 16, height: 268 }, 300, 40)).toBeNull();
  });

  it("brings a block from under the actions or the keyboard up to the viewport's bottom, what is above it in view", () => {
    // The error 400 pt down a 300-pt viewport scrolled 50: up by 136, its bottom 16 pt over the viewport's.
    expect(revealScroll({ top: 400, height: 20 }, 300, 50)).toBe(186);
    // Half hidden under the pinned button.
    expect(revealScroll({ top: 290, height: 18 }, 300, 0)).toBe(24);
  });

  it("brings a block above the viewport down to its top, never past the content's start", () => {
    expect(revealScroll({ top: -50, height: 20 }, 300, 200)).toBe(134);
    expect(revealScroll({ top: -50, height: 20 }, 300, 30)).toBe(0);
  });

  it("puts a block taller than the viewport at its top", () => {
    expect(revealScroll({ top: 280, height: 400 }, 300, 0)).toBe(264);
  });
});
