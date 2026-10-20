import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { baselineOffset, rn } from "../rn-type";
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
 * 07, measured on the card (pt from its top-left corner; the card is the phone's width less 7.2 a side): radius 10, a
 * hairline and a soft shadow; the month's name and the arrows on one line; the weekdays; the days in light grey
 * squares 29.1 tall, the columns 2.5 apart from 11.3 inside the card's left edge to 9.9 inside its right, the rows
 * 31.05 apart. The chosen days are navy circles 29.7 across; the band between them is a light blue laid over the
 * squares, so they show through it, its ends round where a week starts or ends.
 */
const CARD = {
  radius: 10,
  gap: 6.4,
  title: { baseline: 25.45, left: 14.94 },
  /** The arrows' centres, from the card's right edge and top; Lucide's chevrons at 15.4 with a 0.96-pt line. */
  arrows: { back: 66.69, on: 22.22, centre: 19.62, glyph: { size: 15.4, stroke: 1.5 } },
  /** The weekdays on their own columns, a little narrower than the days' (07: 51.1 apart against 51.4). */
  weekdays: { baseline: 49.77, left: 10.55, right: 10.28 },
  /**
   * The days, fitted over both months — the image draws November's rows 30.5 to 31.9 apart from 56.6 under the card's
   * top and December's about 31.2 apart from 57.0: 56.5 down, 31.02 apart, the card ending 11.95 under the last row.
   */
  grid: { top: 56.5, left: 11.31, right: 9.93, bottom: 11.95, columnGap: 2.465, rowGap: 1.92 },
} as const;

/** The figures' baselines from the square's top: the day's 18.35; the chosen's 18.7, centred in its circle. */
const DAY = { height: 29.1, radius: 4.8, circle: 29.7, baseline: 18.35, chosenBaseline: 18.7 } as const;

const DAY_TYPE = rn(tokens.type.day);
const CHOSEN_TYPE = rn(tokens.type.dayChosen);
const WEEKDAY_TYPE = rn(tokens.type.weekday);
const TITLE_TYPE = rn(tokens.type.monthTitle);
/** Where each line's box starts for its baseline to fall where 07 draws it. */
const TOP = {
  title: CARD.title.baseline - baselineOffset(tokens.type.monthTitle),
  weekdays: CARD.weekdays.baseline - baselineOffset(tokens.type.weekday),
  day: DAY.baseline - baselineOffset(tokens.type.day),
  chosen: DAY.chosenBaseline - baselineOffset(tokens.type.dayChosen),
};

/**
 * The dates page's months (07, 24): a white card per month — its name and the arrows that move every card by a month,
 * the days from Monday in light grey squares, the chosen days navy circles joined by the band. The window opens on the
 * month being chosen; it moves from this month to the last that can be booked.
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
      <Text style={[TITLE_TYPE, styles.title, { top: TOP.title }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <Arrow testID={`${id}.back`} icon="chevron-left" label="Previous month" onPress={back} right={CARD.arrows.back} />
      <Arrow testID={`${id}.on`} icon="chevron" label="Next month" onPress={on} right={CARD.arrows.on} />
      <View style={[styles.weekdays, { top: TOP.weekdays }]}>
        {weekdayNames().map((d) => (
          <Text key={d} style={[WEEKDAY_TYPE, styles.weekday]} numberOfLines={1}>
            {d}
          </Text>
        ))}
      </View>
      <View style={[styles.grid, disabled && styles.gridDisabled]}>
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
      <View pointerEvents="none" style={styles.edge} />
    </View>
  );
}

function Arrow({
  testID,
  icon,
  label,
  onPress,
  right,
}: {
  testID: string;
  icon: "chevron-left" | "chevron";
  label: string;
  onPress: (() => void) | null;
  right: number;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: onPress == null }}
      disabled={onPress == null}
      onPress={onPress ?? undefined}
      style={({ pressed }) => [
        styles.arrow,
        { right: right - TARGET / 2, top: CARD.arrows.centre - TARGET / 2 },
        onPress == null && styles.arrowOff,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={icon}
        size={CARD.arrows.glyph.size}
        color={tokens.colors.textPrimary}
        strokeWidth={CARD.arrows.glyph.stroke}
      />
    </Pressable>
  );
}

const TARGET = 44;

/**
 * One day: a light grey square. The chosen departure and return are navy circles; the band joins them through the days
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
  if (!cell.inMonth) return <View style={styles.cell} />;
  const circle = cell.state === "start" || cell.state === "end" || cell.state === "single";
  const band = cell.state === "inRange" || cell.state === "start" || cell.state === "end";
  const blocked = cell.disabled || disabled;
  const type = circle ? CHOSEN_TYPE : DAY_TYPE;
  return (
    <Pressable
      testID={`calendar.day.${cell.date}`}
      accessibilityRole="button"
      accessibilityLabel={cell.date}
      accessibilityState={{ disabled: blocked, selected: circle || cell.state === "inRange" }}
      disabled={blocked}
      onPress={() => onSelect(cell.date)}
      // The slop reaches into the gaps around the square: the 31-pt row and the column make the day a full target
      // without taking its neighbour's.
      hitSlop={{ top: CARD.grid.rowGap / 2, bottom: CARD.grid.rowGap / 2 }}
      style={styles.cell}
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
      <Text
        style={[
          type,
          styles.day,
          { top: circle ? TOP.chosen : TOP.day, paddingRight: -(type.letterSpacing ?? 0) },
          cell.disabled && styles.dayOff,
          circle && styles.dayChosen,
        ]}
      >
        {cell.day}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: { gap: CARD.gap },
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: CARD.radius,
    paddingTop: CARD.grid.top,
    paddingLeft: CARD.grid.left,
    paddingRight: CARD.grid.right,
    paddingBottom: CARD.grid.bottom,
    ...tokens.elevation.soft,
  },
  // The card's hairline, drawn over its edge: it does not move what is measured from the card's corner.
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: CARD.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  title: { position: "absolute", left: CARD.title.left, right: 100, color: tokens.colors.textPrimary },
  arrow: {
    position: "absolute",
    width: TARGET,
    height: TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TARGET / 2,
  },
  arrowOff: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  weekdays: {
    position: "absolute",
    left: CARD.weekdays.left,
    right: CARD.weekdays.right,
    flexDirection: "row",
  },
  weekday: { flex: 1, textAlign: "center", color: tokens.colors.textSecondary },
  grid: { gap: CARD.grid.rowGap },
  gridDisabled: { opacity: 0.4 },
  row: { flexDirection: "row", gap: CARD.grid.columnGap },
  cell: {
    flex: 1,
    height: DAY.height,
    borderRadius: DAY.radius,
    backgroundColor: tokens.colors.surfaceNeutral,
    alignItems: "center",
  },
  // Laid over the square and half the gap at each side, so the bands of two days meet in the gap between them.
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -CARD.grid.columnGap / 2,
    right: -CARD.grid.columnGap / 2,
    backgroundColor: tokens.colors.dayBand,
  },
  // The band starts under the departure's circle and ends under the return's.
  fromCentre: { left: "50%" },
  toCentre: { right: "50%" },
  weekStart: { left: 0, borderTopLeftRadius: DAY.height / 2, borderBottomLeftRadius: DAY.height / 2 },
  weekEnd: { right: 0, borderTopRightRadius: DAY.height / 2, borderBottomRightRadius: DAY.height / 2 },
  circle: {
    position: "absolute",
    top: (DAY.height - DAY.circle) / 2,
    width: DAY.circle,
    height: DAY.circle,
    borderRadius: DAY.circle / 2,
    backgroundColor: tokens.colors.actionPrimary,
  },
  // The tracking the figures are drawn with also follows the last one: the same room on the right keeps the number
  // centred in its square.
  day: { position: "absolute", left: 0, right: 0, textAlign: "center", color: tokens.colors.textPrimary },
  dayOff: { color: tokens.colors.textSecondary },
  dayChosen: { color: tokens.colors.textOnPhoto },
});
