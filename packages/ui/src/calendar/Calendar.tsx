import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { monthWeeks, type Cell, type ISODate, type Selection } from "./calendar-logic";

type Props = { selection: Selection; today: ISODate; months?: number; onSelect: (d: ISODate) => void; testID: string };
const MONTHS = [
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
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** Renders the months; the parent (a BottomSheetScrollView) scrolls them. */
export function Calendar({ selection, today, months = 12, onSelect, testID }: Props) {
  const parts = today.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (y === undefined || m === undefined) return <View testID={testID} />;
  return (
    <View testID={testID}>
      {Array.from({ length: months }, (_, i) => {
        const m0 = m - 1 + i;
        const year = y + Math.floor(m0 / 12);
        const month = ((m0 % 12) + 12) % 12;
        return (
          <Month key={`${year}-${month}`} y={year} m0={month} selection={selection} today={today} onSelect={onSelect} />
        );
      })}
    </View>
  );
}

function Month({
  y,
  m0,
  selection,
  today,
  onSelect,
}: {
  y: number;
  m0: number;
  selection: Selection;
  today: ISODate;
  onSelect: (d: ISODate) => void;
}) {
  // Only the weeks the month spans: a sixth row of next month's days would stand blank between two months.
  const weeks = monthWeeks(y, m0, selection, today);
  const title = MONTHS[m0] ?? "";
  return (
    <View style={styles.month}>
      <Text style={styles.title}>{`${title} ${y}`}</Text>
      <View style={styles.row}>
        {DOW.map((d, i) => (
          <Text key={i} style={styles.dow}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((w, i) => (
        <View key={i} style={styles.row}>
          {w.map((c) => (
            <Day key={c.date} cell={c} onSelect={onSelect} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * One day. The seven days share the row's width (no gaps), so the range reads as one continuous band: full across the
 * days inside it, from the circle's centre outwards on the departure and return days, whose filled circles sit on its
 * ends. The band is light (`border-default`) so the numbers on it keep `text-primary`; only the two ends are filled.
 */
function Day({ cell, onSelect }: { cell: Cell; onSelect: (d: ISODate) => void }) {
  if (!cell.inMonth) return <View style={styles.cell} />;
  const band = cell.state === "inRange" || cell.state === "start" || cell.state === "end";
  const filled = cell.state === "start" || cell.state === "end" || cell.state === "single";
  return (
    <Pressable
      testID={`calendar.day.${cell.date}`}
      accessibilityRole="button"
      accessibilityLabel={cell.date}
      accessibilityState={{ disabled: cell.disabled, selected: filled }}
      disabled={cell.disabled}
      onPress={() => onSelect(cell.date)}
      // No hit slop: the days touch, and a slop would give each day's edge to its neighbour.
      style={styles.cell}
    >
      {band ? (
        <View
          style={[
            styles.band,
            cell.state === "start" && styles.bandFromCentre,
            cell.state === "end" && styles.bandToCentre,
          ]}
        />
      ) : null}
      <View style={[styles.dot, filled && styles.dotFilled]}>
        <Text style={[styles.dayText, cell.disabled && styles.dayDisabled, filled && styles.dayFilled]}>
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

/** A day is 48 pt tall (DESIGN.md: 44 pt on iOS, 48 dp on Android) and a seventh of the row wide — 49 pt on a 393 pt
 *  phone; the circle and the band are 40 pt, centred in it. */
const DAY = 48;
const DOT = 40;
const styles = StyleSheet.create({
  month: { marginBottom: tokens.space.lg },
  title: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, marginBottom: tokens.space.sm },
  row: { flexDirection: "row" },
  dow: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary, flex: 1, textAlign: "center" },
  cell: { flex: 1, height: DAY, alignItems: "center", justifyContent: "center" },
  band: {
    position: "absolute",
    top: (DAY - DOT) / 2,
    bottom: (DAY - DOT) / 2,
    left: 0,
    right: 0,
    backgroundColor: tokens.colors.borderDefault,
  },
  bandFromCentre: { left: "50%" },
  bandToCentre: { right: "50%" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: "center", justifyContent: "center" },
  dotFilled: { backgroundColor: tokens.colors.actionPrimary },
  dayText: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  dayDisabled: { color: tokens.colors.textTertiary },
  dayFilled: { color: tokens.colors.textOnDark },
});
