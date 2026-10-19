import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import {
  monthTitle,
  monthWeeks,
  shiftMonth,
  weekdayNames,
  windowMoves,
  windowStart,
  type Cell,
  type ISODate,
  type Month,
  type Selection,
} from "./calendar-logic";

type Props = {
  selection: Selection;
  today: ISODate;
  onSelect: (d: ISODate) => void;
  testID: string;
  /** Months shown at a time, one card each (07: two). */
  months?: number;
  /** The dates are left flexible (07's toggle on): the days show, dimmed, and none can be chosen. */
  disabled?: boolean;
};

/**
 * The dates page's months (07, 24): a white card per month — its name and the arrows that move every card by a month,
 * the days from Monday in light tint squares, the chosen days navy circles joined by a light navy band. The window opens
 * on the month being chosen; it moves from this month to the last that can be booked.
 */
export function Calendar({ selection, today, onSelect, testID, months = 2, disabled = false }: Props) {
  const [start, setStart] = useState<Month>(() => windowStart(selection, today, months));
  const moves = windowMoves(start, today, months);
  const shown = Array.from({ length: months }, (_, i) => shiftMonth(start, i));
  return (
    <View testID={testID} style={styles.window}>
      {shown.map((month) => (
        <MonthCard
          key={`${month.y}-${month.m0}`}
          month={month}
          selection={selection}
          today={today}
          onSelect={onSelect}
          disabled={disabled}
          back={moves.back ? () => setStart((s) => shiftMonth(s, -1)) : null}
          on={moves.on ? () => setStart((s) => shiftMonth(s, 1)) : null}
        />
      ))}
    </View>
  );
}

function MonthCard({
  month,
  selection,
  today,
  onSelect,
  disabled,
  back,
  on,
}: {
  month: Month;
  selection: Selection;
  today: ISODate;
  onSelect: (d: ISODate) => void;
  disabled: boolean;
  back: (() => void) | null;
  on: (() => void) | null;
}) {
  // Only the weeks the month spans: a sixth row of next month's days would stand blank in the card.
  const weeks = monthWeeks(month.y, month.m0, selection, today);
  const title = monthTitle(month);
  const id = `calendar.month.${month.y}-${String(month.m0 + 1).padStart(2, "0")}`;
  return (
    <View style={styles.card} testID={id}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Arrow testID={`${id}.back`} icon="chevron-left" label="Previous month" onPress={back} />
        <Arrow testID={`${id}.on`} icon="chevron" label="Next month" onPress={on} />
      </View>
      <View style={[styles.grid, disabled && styles.gridDisabled]}>
        <View style={styles.row}>
          {weekdayNames().map((d) => (
            <Text key={d} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, i) => (
          <View key={i} style={styles.row}>
            {week.map((cell, j) => (
              <Day
                key={cell.date}
                cell={cell}
                onSelect={onSelect}
                disabled={disabled}
                first={j === 0}
                last={j === week.length - 1}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Arrow({
  testID,
  icon,
  label,
  onPress,
}: {
  testID: string;
  icon: "chevron-left" | "chevron";
  label: string;
  onPress: (() => void) | null;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: onPress == null }}
      disabled={onPress == null}
      onPress={onPress ?? undefined}
      style={({ pressed }) => [styles.arrow, onPress == null && styles.arrowOff, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={tokens.colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * One day: a light tint square. The chosen departure and return are navy circles; the band joins them through the days
 * between, across the gaps, its ends rounded where a week starts or ends. A day that cannot be chosen keeps its square
 * with its number in slate; the squares of the weeks' other months stay blank.
 */
function Day({
  cell,
  onSelect,
  disabled,
  first,
  last,
}: {
  cell: Cell;
  onSelect: (d: ISODate) => void;
  disabled: boolean;
  first: boolean;
  last: boolean;
}) {
  if (!cell.inMonth) return <View style={[styles.cell, styles.square]} />;
  const circle = cell.state === "start" || cell.state === "end" || cell.state === "single";
  const band = cell.state === "inRange" || cell.state === "start" || cell.state === "end";
  const blocked = cell.disabled || disabled;
  return (
    <Pressable
      testID={`calendar.day.${cell.date}`}
      accessibilityRole="button"
      accessibilityLabel={cell.date}
      accessibilityState={{ disabled: blocked, selected: circle || cell.state === "inRange" }}
      disabled={blocked}
      onPress={() => onSelect(cell.date)}
      // The slop reaches into the 4-pt gaps above and below, so a day is a 44-pt target without taking its neighbour's.
      hitSlop={{ top: GAP / 2, bottom: GAP / 2 }}
      style={[styles.cell, !band && !circle && styles.square]}
    >
      {band ? (
        <View
          style={[
            styles.band,
            cell.state === "start" ? styles.fromCentre : first ? styles.weekStart : null,
            cell.state === "end" ? styles.toCentre : last ? styles.weekEnd : null,
          ]}
        />
      ) : null}
      {circle ? <View style={styles.circle} /> : null}
      <Text style={[styles.day, cell.disabled && styles.dayOff, circle && styles.dayChosen]}>{cell.day}</Text>
    </Pressable>
  );
}

/** 07: days 40 pt tall, 4 apart; the circles as tall as the days. */
const DAY = 40;
const GAP = 4;

const styles = StyleSheet.create({
  window: { gap: tokens.space.sm },
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingTop: tokens.space.xs,
    paddingBottom: tokens.space.md,
    ...tokens.elevation.card,
  },
  head: { flexDirection: "row", alignItems: "center", minHeight: 52 },
  title: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, flex: 1 },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.pill },
  arrowOff: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  grid: { gap: GAP },
  gridDisabled: { opacity: 0.4 },
  row: { flexDirection: "row", gap: GAP },
  weekday: {
    ...rn(tokens.type.bodySm),
    color: tokens.colors.textSecondary,
    flex: 1,
    textAlign: "center",
    paddingBottom: tokens.space.xxs,
  },
  cell: { flex: 1, height: DAY, alignItems: "center", justifyContent: "center" },
  square: { backgroundColor: tokens.colors.surfaceTint, borderRadius: tokens.radius.xs },
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -GAP / 2,
    right: -GAP / 2,
    backgroundColor: tokens.colors.borderDefault,
  },
  // The band starts under the departure's circle and ends under the return's.
  fromCentre: { left: "50%" },
  toCentre: { right: "50%" },
  weekStart: { left: 0, borderTopLeftRadius: DAY / 2, borderBottomLeftRadius: DAY / 2 },
  weekEnd: { right: 0, borderTopRightRadius: DAY / 2, borderBottomRightRadius: DAY / 2 },
  circle: {
    position: "absolute",
    width: DAY,
    height: DAY,
    borderRadius: DAY / 2,
    backgroundColor: tokens.colors.actionPrimary,
  },
  day: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  dayOff: { color: tokens.colors.textSecondary },
  dayChosen: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textOnPhoto },
});
