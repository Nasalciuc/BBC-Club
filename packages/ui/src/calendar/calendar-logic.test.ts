import { test, expect } from "bun:test";
import {
  addDays,
  ctaLabel,
  sheetTitle,
  daysBetween,
  monthGrid,
  monthWeeks,
  selectDay,
  todayLocal,
  type Selection,
} from "./calendar-logic";

const today = "2026-09-26";
const round: Selection = { tripType: "round", depart: null, ret: null, editing: "depart" };

test("first tap departs, second returns, label matches Figma", () => {
  const a = selectDay(round, "2026-10-12", today);
  const b = selectDay(a, "2026-10-19", today);
  expect([b.depart, b.ret]).toEqual(["2026-10-12", "2026-10-19"]);
  expect(ctaLabel(b)).toEqual({ label: "Use Oct 12 – 19 · 7 nights", enabled: true });
});

test("a tap before the departure restarts from that day", () => {
  const b = selectDay(selectDay(round, "2026-10-12", today), "2026-10-05", today);
  expect([b.depart, b.ret, b.editing]).toEqual(["2026-10-05", null, "return"]);
});

test("past days and days beyond ~11 months cannot be chosen", () => {
  expect(selectDay(round, "2026-09-25", today)).toBe(round);
  expect(selectDay(round, addDays(today, 331), today)).toBe(round);
});

test("one way: one date, label 'Use Oct 12'", () => {
  const s = selectDay({ ...round, tripType: "oneway" }, "2026-10-12", today);
  expect(ctaLabel(s)).toEqual({ label: "Use Oct 12", enabled: true });
});

test("DST: Oct 25 (London) and Nov 1 (New York) do not shift nights", () => {
  expect(daysBetween("2026-10-24", "2026-11-02")).toBe(9);
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
});

test("month grid: October 2026 starts on Thursday, 6 weeks, Oct 1 in place", () => {
  const g = monthGrid(2026, 9, round, today);
  const week = g[0];
  expect(g.length).toBe(6);
  expect(week?.[4]?.date).toBe("2026-10-01");
  expect(week?.[3]?.inMonth).toBe(false);
});

test("month weeks: only the weeks a month spans, so no blank row between two months", () => {
  const weeks = (y: number, m0: number) => monthWeeks(y, m0, round, today);
  // October 2026 starts on a Thursday and ends on a Saturday: five weeks, the grid's sixth (Nov 1–7) left out.
  expect(weeks(2026, 9).length).toBe(5);
  expect(weeks(2026, 9).at(-1)?.at(-1)?.date).toBe("2026-10-31");
  // February 2026 starts on a Sunday: exactly four. August 2026 starts on a Saturday: all six.
  expect(weeks(2026, 1).length).toBe(4);
  expect(weeks(2026, 7).length).toBe(6);
  expect(weeks(2026, 7).every((week) => week.some((c) => c.inMonth))).toBe(true);
});

test("range states for the band", () => {
  const s: Selection = { tripType: "round", depart: "2026-10-12", ret: "2026-10-19", editing: "depart" };
  const flat = monthGrid(2026, 9, s, today).flat();
  const st = (d: string) => {
    const cell = flat.find((c) => c.date === d);
    if (!cell) throw new Error(d);
    return cell.state;
  };
  expect([st("2026-10-12"), st("2026-10-15"), st("2026-10-19"), st("2026-10-20")]).toEqual([
    "start",
    "inRange",
    "end",
    "none",
  ]);
});

test("todayLocal uses the phone's calendar day, not UTC", () => {
  expect(todayLocal(new Date(2026, 8, 26, 23, 30))).toBe("2026-09-26");
});

test("sheet titles match the Figma frames", () => {
  expect(sheetTitle(round)).toBe("Departure date");
  const a = selectDay(round, "2026-10-12", today);
  expect(sheetTitle(a)).toBe("Return date");
  expect(sheetTitle(selectDay(a, "2026-10-19", today))).toBe("Travel dates");
  expect(sheetTitle(selectDay({ ...round, tripType: "oneway" }, "2026-10-12", today))).toBe("Departure date");
});
