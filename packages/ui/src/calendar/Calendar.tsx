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
      <View>
        {weeks.map((w, i) => (
          <View key={i} style={styles.row}>
            {w.map((c) => (
              <Day key={c.date} cell={c} onSelect={onSelect} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One day (Figma _Calendar / Day, 322:212): a 48-pt square. The range is one light band, 32 pt high, through the days
 * inside it and from the circle's centre outwards on the departure and return days, whose 48-pt navy circles sit on its
 * ends. The band is `border-default`, so the numbers on it keep `text-primary`; only the two ends are filled.
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

/** Figma Calendar (322:1446): seven 48-pt days, a 336-pt grid centred in the sheet; months 24 pt apart. */
const DAY = 48;
const BAND = 32;
const styles = StyleSheet.create({
  month: { width: DAY * 7, alignSelf: "center", gap: tokens.space.sm, marginBottom: tokens.space.lg },
  title: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  row: { flexDirection: "row" },
  dow: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary, width: DAY, textAlign: "center" },
  cell: { width: DAY, height: DAY, alignItems: "center", justifyContent: "center" },
  band: {
    position: "absolute",
    top: (DAY - BAND) / 2,
    height: BAND,
    left: 0,
    right: 0,
    backgroundColor: tokens.colors.borderDefault,
  },
  bandFromCentre: { left: DAY / 2 },
  bandToCentre: { right: DAY / 2 },
  dot: { width: DAY, height: DAY, borderRadius: DAY / 2, alignItems: "center", justifyContent: "center" },
  dotFilled: { backgroundColor: tokens.colors.actionPrimary },
  dayText: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  dayDisabled: { color: tokens.colors.textSecondary },
  dayFilled: { color: tokens.colors.textOnPhoto },
});
