/** Pure calendar logic for the request dates sheet. Dates are calendar days (YYYY-MM-DD), never instants:
 *  all arithmetic is done in UTC so a DST change or the phone's time zone can never shift a day. */
export type ISODate = string; // "2026-10-12"

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (y: number, m0: number, d: number): ISODate => {
  const t = new Date(Date.UTC(y, m0, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
export const parse = (d: ISODate) => {
  const [y, m, dd] = d.split("-").map(Number);
  if (
    y === undefined ||
    m === undefined ||
    dd === undefined ||
    Number.isNaN(y) ||
    Number.isNaN(m) ||
    Number.isNaN(dd)
  ) {
    throw new Error(`bad calendar day: ${d}`);
  }
  return { y, m0: m - 1, d: dd };
};
export const addDays = (d: ISODate, n: number): ISODate => {
  const p = parse(d);
  return iso(p.y, p.m0, p.d + n);
};
export const daysBetween = (a: ISODate, b: ISODate) => {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m0, pb.d) - Date.UTC(pa.y, pa.m0, pa.d)) / 86_400_000);
};
/** Today in the member's own calendar (local date), as a calendar day. */
export const todayLocal = (now: Date = new Date()): ISODate => iso(now.getFullYear(), now.getMonth(), now.getDate());

export type Selection = {
  tripType: "round" | "oneway";
  depart: ISODate | null;
  ret: ISODate | null;
  editing: "depart" | "return";
};
export type DayState = "none" | "start" | "end" | "single" | "inRange";
export type Cell = {
  date: ISODate;
  day: number;
  inMonth: boolean;
  disabled: boolean;
  state: DayState;
  isToday: boolean;
};

/** Airlines publish about 11 months ahead. */
export const MAX_DAYS_AHEAD = 330;

/**
 * The day a week starts on: Monday, as the dates page draws it (07, 24 — `Mon … Sun`). 1.0 started on Sunday for the
 * club's US members; this one value turns it back (0).
 */
export const WEEK_START: 0 | 1 = 1;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The column heads, from `WEEK_START`: `Mon Tue Wed Thu Fri Sat Sun` (07). */
export function weekdayNames(): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + WEEK_START) % 7] ?? "");
}

/** 6 weeks × 7 days, from `WEEK_START`. */
export function monthGrid(y: number, m0: number, sel: Selection, today: ISODate): Cell[][] {
  const firstDow = (new Date(Date.UTC(y, m0, 1)).getUTCDay() - WEEK_START + 7) % 7;
  const start = iso(y, m0, 1 - firstDow);
  const max = addDays(today, MAX_DAYS_AHEAD);
  const weeks: Cell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i);
      const p = parse(date);
      row.push({
        date,
        day: p.d,
        inMonth: p.m0 === ((m0 % 12) + 12) % 12,
        disabled: date < today || date > max,
        state: stateOf(date, sel),
        isToday: date === today,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** The weeks a month actually spans — four to six. The grid's last week can hold only the next month's days; drawn, it
 *  is a blank row between two months, so it is left out. */
export function monthWeeks(y: number, m0: number, sel: Selection, today: ISODate): Cell[][] {
  return monthGrid(y, m0, sel, today).filter((week) => week.some((c) => c.inMonth));
}

export function stateOf(date: ISODate, sel: Selection): DayState {
  const { depart, ret } = sel;
  if (sel.tripType === "oneway" || !ret) return depart === date ? "single" : "none";
  if (date === depart) return "start";
  if (date === ret) return "end";
  return depart && date > depart && date < ret ? "inRange" : "none";
}

/** First tap sets the departure, the second the return; a tap before the departure restarts from that day. */
export function selectDay(sel: Selection, date: ISODate, today: ISODate): Selection {
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) return sel;
  if (sel.tripType === "oneway") return { ...sel, depart: date, ret: null, editing: "depart" };
  if (sel.editing === "depart" || !sel.depart || date < sel.depart)
    return { ...sel, depart: date, ret: sel.ret && sel.ret > date ? sel.ret : null, editing: "return" };
  if (date === sel.depart) return { ...sel, ret: null, editing: "return" };
  return { ...sel, ret: date, editing: "depart" };
}

/** A month: its year and its index from 0 (January). */
export type Month = { y: number; m0: number };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `November 2026` (07). */
export function monthTitle(month: Month): string {
  return `${MONTH_NAMES[month.m0] ?? ""} ${month.y}`;
}

export function monthOf(d: ISODate): Month {
  const p = parse(d);
  return { y: p.y, m0: p.m0 };
}

/** The month `n` months from `month` (n may be negative). */
export function shiftMonth(month: Month, n: number): Month {
  const total = month.y * 12 + month.m0 + n;
  return { y: Math.floor(total / 12), m0: ((total % 12) + 12) % 12 };
}

/** Months from `a` to `b`: 0 for the same month, negative when `b` is earlier. */
export function monthsBetween(a: Month, b: Month): number {
  return b.y * 12 + b.m0 - (a.y * 12 + a.m0);
}

/**
 * The dates page shows a few months at a time (07: two), from the month of the date being chosen — the return's while
 * the return is edited, else the departure's — or this month when none is chosen yet; never before this month, and
 * never so late that the window's last month is past the last day that can be chosen.
 */
export function windowStart(sel: Selection, today: ISODate, months = 2): Month {
  const first = monthOf(today);
  const last = shiftMonth(monthOf(addDays(today, MAX_DAYS_AHEAD)), 1 - months);
  const at = sel.editing === "return" && sel.ret ? sel.ret : sel.depart;
  const wanted = at ? monthOf(at) : first;
  if (monthsBetween(first, wanted) < 0) return first;
  if (monthsBetween(wanted, last) < 0) return monthsBetween(first, last) < 0 ? first : last;
  return wanted;
}

/** Whether the window can move back a month (not before this month) and on a month (not past the last bookable day). */
export function windowMoves(start: Month, today: ISODate, months = 2): { back: boolean; on: boolean } {
  const first = monthOf(today);
  const last = monthOf(addDays(today, MAX_DAYS_AHEAD));
  return { back: monthsBetween(first, start) > 0, on: monthsBetween(shiftMonth(start, months - 1), last) > 0 };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const short = (d: ISODate) => {
  const p = parse(d);
  return `${MON[p.m0]} ${p.d}`;
};

/**
 * Whether `Use these dates` can be pressed (07, 24 — the pill keeps its words; disabled until the trip has its dates):
 * one way needs its departure, a round trip both days.
 */
export function datesChosen(sel: Selection): boolean {
  return sel.tripType === "oneway" ? sel.depart != null : sel.depart != null && sel.ret != null;
}

/** The page's title (07, 24): one way → "Departure date"; round trip → "Departure date" until a departure is chosen,
 *  "Return date" while choosing the return, "Travel dates" once both are set. */
export function sheetTitle(sel: Selection): "Departure date" | "Return date" | "Travel dates" {
  if (sel.tripType === "oneway" || !sel.depart) return "Departure date";
  if (!sel.ret) return "Return date";
  return "Travel dates";
}
