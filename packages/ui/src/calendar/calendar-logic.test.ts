import { test, expect } from "bun:test";
import {
  addDays,
  datesChosen,
  sheetTitle,
  daysBetween,
  monthGrid,
  monthTitle,
  monthWeeks,
  monthsBetween,
  selectDay,
  shiftMonth,
  todayLocal,
  weekdayNames,
  windowMoves,
  windowStart,
  type Selection,
} from "./calendar-logic";

const today = "2026-09-26";
const round: Selection = { tripType: "round", depart: null, ret: null, editing: "depart" };

test("first tap departs, second returns; the pill acts once both are chosen", () => {
  const a = selectDay(round, "2026-10-12", today);
  expect(datesChosen(a)).toBe(false);
  const b = selectDay(a, "2026-10-19", today);
  expect([b.depart, b.ret]).toEqual(["2026-10-12", "2026-10-19"]);
  expect(datesChosen(b)).toBe(true);
});

test("a tap before the departure restarts from that day", () => {
  const b = selectDay(selectDay(round, "2026-10-12", today), "2026-10-05", today);
  expect([b.depart, b.ret, b.editing]).toEqual(["2026-10-05", null, "return"]);
});

test("past days and days beyond ~11 months cannot be chosen", () => {
  expect(selectDay(round, "2026-09-25", today)).toBe(round);
  expect(selectDay(round, addDays(today, 331), today)).toBe(round);
});

test("one way: one date is enough", () => {
  expect(datesChosen({ ...round, tripType: "oneway" })).toBe(false);
  const s = selectDay({ ...round, tripType: "oneway" }, "2026-10-12", today);
  expect(datesChosen(s)).toBe(true);
});

test("DST: Oct 25 (London) and Nov 1 (New York) do not shift nights", () => {
  expect(daysBetween("2026-10-24", "2026-11-02")).toBe(9);
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
});

test("weeks start on Monday, as 07 draws them", () => {
  expect(weekdayNames()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});

test("month grid: October 2026 starts on Thursday, 6 weeks, Oct 1 in place", () => {
  const g = monthGrid(2026, 9, round, today);
  const week = g[0];
  expect(g.length).toBe(6);
  expect(week?.[0]?.date).toBe("2026-09-28");
  expect(week?.[3]?.date).toBe("2026-10-01");
  expect(week?.[2]?.inMonth).toBe(false);
});

test("month weeks: only the weeks a month spans, so no blank row between two months", () => {
  const weeks = (y: number, m0: number) => monthWeeks(y, m0, round, today);
  // November 2026 (07): Sunday the 1st alone in its first week, Monday the 30th alone in its last — six weeks.
  expect(weeks(2026, 10).length).toBe(6);
  expect(weeks(2026, 10)[0]?.[6]?.date).toBe("2026-11-01");
  expect(weeks(2026, 10).at(-1)?.[0]?.date).toBe("2026-11-30");
  // October 2026 ends on a Saturday: five weeks, the grid's sixth (Nov 2–8) left out.
  expect(weeks(2026, 9).length).toBe(5);
  expect(weeks(2026, 9).at(-1)?.[5]?.date).toBe("2026-10-31");
  // February 2027 starts on a Monday: exactly four. August 2026 starts on a Saturday: all six.
  expect(weeks(2027, 1).length).toBe(4);
  expect(weeks(2026, 7).length).toBe(6);
  expect(weeks(2026, 7).every((week) => week.some((c) => c.inMonth))).toBe(true);
});

test("months: titles, steps across a year, distances", () => {
  expect(monthTitle({ y: 2026, m0: 10 })).toBe("November 2026");
  expect(shiftMonth({ y: 2026, m0: 11 }, 1)).toEqual({ y: 2027, m0: 0 });
  expect(shiftMonth({ y: 2027, m0: 0 }, -1)).toEqual({ y: 2026, m0: 11 });
  expect(monthsBetween({ y: 2026, m0: 10 }, { y: 2027, m0: 1 })).toBe(3);
  expect(monthsBetween({ y: 2027, m0: 1 }, { y: 2026, m0: 10 })).toBe(-3);
});

test("the window opens on the month being chosen, never before this month nor past the last bookable one", () => {
  // This month when nothing is chosen; the departure's month; the return's while the return is edited.
  expect(windowStart(round, today)).toEqual({ y: 2026, m0: 8 });
  const trip: Selection = { tripType: "round", depart: "2026-11-12", ret: "2026-12-19", editing: "depart" };
  expect(windowStart(trip, today)).toEqual({ y: 2026, m0: 10 });
  expect(windowStart({ ...trip, editing: "return" }, today)).toEqual({ y: 2026, m0: 11 });
  // A day in the past opens this month; one past the last bookable day, the last window (Jul–Aug 2027 from Sep 26).
  expect(windowStart({ ...trip, depart: "2026-01-05" }, today)).toEqual({ y: 2026, m0: 8 });
  expect(windowStart({ ...trip, depart: "2027-12-01" }, today)).toEqual({ y: 2027, m0: 6 });
});

test("the window moves back to this month at most, and on until it shows the last bookable day", () => {
  expect(windowMoves({ y: 2026, m0: 8 }, today)).toEqual({ back: false, on: true });
  expect(windowMoves({ y: 2026, m0: 10 }, today)).toEqual({ back: true, on: true });
  // 330 days from Sep 26, 2026 is Aug 22, 2027: a window of Jul–Aug 2027 shows it.
  expect(windowMoves({ y: 2027, m0: 6 }, today)).toEqual({ back: true, on: false });
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
