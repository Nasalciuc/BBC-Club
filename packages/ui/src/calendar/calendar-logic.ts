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

/** 6 weeks × 7 days, weeks start on Sunday (US members). */
export function monthGrid(y: number, m0: number, sel: Selection, today: ISODate): Cell[][] {
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay();
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

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const short = (d: ISODate) => {
  const p = parse(d);
  return `${MON[p.m0]} ${p.d}`;
};

/** The button label from the Figma frames: "Use Oct 12 – 19 · 7 nights" · "Use Oct 12" · disabled "Use these dates". */
export function ctaLabel(sel: Selection): { label: string; enabled: boolean } {
  if (sel.tripType === "oneway")
    return sel.depart
      ? { label: `Use ${short(sel.depart)}`, enabled: true }
      : { label: "Use these dates", enabled: false };
  if (!sel.depart || !sel.ret) return { label: "Use these dates", enabled: false };
  const a = parse(sel.depart);
  const b = parse(sel.ret);
  const range =
    a.m0 === b.m0 && a.y === b.y ? `${short(sel.depart)} – ${b.d}` : `${short(sel.depart)} – ${short(sel.ret)}`;
  const n = daysBetween(sel.depart, sel.ret);
  return { label: `Use ${range} · ${n} night${n === 1 ? "" : "s"}`, enabled: true };
}

/** The sheet title from the Figma frames: one way → "Departure date"; round trip → "Departure date" until a departure is
 *  chosen, "Return date" while choosing the return, "Travel dates" once both are set. */
export function sheetTitle(sel: Selection): "Departure date" | "Return date" | "Travel dates" {
  if (sel.tripType === "oneway" || !sel.depart) return "Departure date";
  if (!sel.ret) return "Return date";
  return "Travel dates";
}
