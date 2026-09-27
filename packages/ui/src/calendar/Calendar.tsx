import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { monthGrid, type Cell, type ISODate, type Selection } from "./calendar-logic";

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
  const weeks = monthGrid(y, m0, selection, today);
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
      hitSlop={2}
      style={[
        styles.cell,
        band && styles.band,
        cell.state === "start" && styles.bandStart,
        cell.state === "end" && styles.bandEnd,
      ]}
    >
      <View style={[styles.dot, filled && styles.dotFilled]}>
        <Text style={[styles.dayText, cell.disabled && styles.dayDisabled, filled && styles.dayFilled]}>
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

const CELL = 44;
const styles = StyleSheet.create({
  month: { marginBottom: tokens.space.lg },
  title: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, marginBottom: tokens.space.sm },
  row: { flexDirection: "row", justifyContent: "space-between" },
  dow: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary, width: CELL, textAlign: "center" },
  cell: { width: CELL, height: CELL, alignItems: "center", justifyContent: "center" },
  band: { backgroundColor: tokens.colors.surfaceMuted },
  bandStart: { borderTopLeftRadius: CELL / 2, borderBottomLeftRadius: CELL / 2 },
  bandEnd: { borderTopRightRadius: CELL / 2, borderBottomRightRadius: CELL / 2 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dotFilled: { backgroundColor: tokens.colors.actionPrimary },
  dayText: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  dayDisabled: { color: tokens.colors.textTertiary },
  dayFilled: { color: tokens.colors.textOnDark },
});
