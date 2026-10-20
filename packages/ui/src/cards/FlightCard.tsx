import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { FareVM } from "@bbc/shared/api/v1/fares";

import { Icon } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import { arriveYmd, cabinText, dayText, departYmd, fareBasis, flightFacts } from "./flight-facts";

/**
 * An airline's mark as the design draws it (ADR-IMPL-056): a white-backed picture, set at its own size in points;
 * `nudge`, where 04 sets it off the column's middle.
 */
export type AirlineMark = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  nudge?: { x: number; y: number };
};

type Props = {
  fare: FareVM;
  /**
   * `detailed` (13): one fare on its own — the airline and the cabin over both airports with their clocks and days, the
   * price at the right. `compact` (04, sheet 40): one of several — the airline at the left, the clocks over the codes and
   * the stops, the price at the right.
   */
  layout: "detailed" | "compact";
  /** The airline's mark where the club has it (British Airways, Virgin Atlantic, American); else the fare's logo,
   *  else its name — never a mark made up for it. */
  mark?: AirlineMark | null;
  onPress: () => void;
  testID: string;
};

type TypeRole = TextStyle & { fontSize: number; lineHeight: number };
const r = (t: (typeof tokens.type)[keyof typeof tokens.type]) => rn(t) as TypeRole;

/** The margin that puts a line's baseline `pitch` under the one before it (or under the top of what holds it). */
const after = (pitch: number, prev: TypeRole | null, next: TypeRole) =>
  pitch - (prev ? belowBaseline(prev) : 0) - baselineOffset(next);

const money = (fare: FareVM) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: fare.price.currency, maximumFractionDigits: 0 }).format(
    fare.price.offer,
  );

/**
 * 13, in points from the card's top-left (360.6 × 110.5, radius 10): the mark 12.8 in and 7.05 down at its own size; the
 * cabin 15 from the right on 26.6; each airport's code on 58.4, its clock on 74.0 and its day on 90.6 — the departure
 * 15.4 in, the arrival 178.1; the line from 93.1 to 152.9 on 67.1, the plane over it from 111.3 to 125.3; the rule at
 * 268.1 from 45.9 to 93.9; the price 15.2 from the right on 73.1 and what it buys 15.7 from the right on 89.2.
 */
const DETAILED = {
  height: 110.5,
  radius: 10,
  mark: { left: 12.8, top: 7.05 },
  cabin: { role: r(tokens.type.flightCabin), right: 15, baseline: 26.6 },
  code: { role: r(tokens.type.flightCode), baseline: 58.4 },
  time: { role: r(tokens.type.flightTime), baseline: 74 },
  plus: { role: r(tokens.type.flightPlus) },
  day: { role: r(tokens.type.flightDay), baseline: 90.6 },
  departLeft: 15.4,
  arriveLeft: 178.1,
  line: { left: 93.1, right: 152.9, y: 67.1, plane: { left: 111.3, right: 125.3 }, stroke: 0.7 },
  rule: { left: 268.1, top: 45.9, bottom: 93.9, width: 0.7 },
  price: { role: r(tokens.type.flightPrice), right: 15.2, baseline: 73.1 },
  basis: { role: r(tokens.type.flightBasis), right: 15.7, baseline: 89.2 },
} as const;

/**
 * 04, in points from the card's top-left (370 × 61.4, radius 12.5): the mark centred on 54.6, 27.6 at its own size; the
 * departure's clock 112.5 in on 22.8, its code on 35.7 and the stops on 49.7; the arrow from 159.9 to 187.1, 1.55 over
 * the clocks' baseline; the arrival 205.3 in, its `+1` 3.7 over that baseline and 2.4 after the clock; the price 303.4
 * in on 29.2 and what it buys on 42.6.
 */
const COMPACT = {
  height: 61.4,
  radius: 12.5,
  mark: { centreX: 54.6, centreY: 27.6 },
  time: { role: r(tokens.type.optionTime), baseline: 22.8 },
  code: { role: r(tokens.type.optionCode), baseline: 35.7 },
  meta: { role: r(tokens.type.optionMeta), baseline: 49.7 },
  plus: { role: r(tokens.type.optionPlus), rise: 3.7, gap: 2.4 },
  departLeft: 112.5,
  arriveLeft: 205.3,
  arrow: { left: 159.9, width: 27.2, height: 8.3, rise: 1.55, stroke: 0.9 },
  price: { role: r(tokens.type.optionPrice), left: 303.4, baseline: 29.2 },
  basis: { role: r(tokens.type.optionBasis), baseline: 42.6 },
} as const;

/** 13: the plane on the line between the airports. */
const PLANE = 17.7;

/** What a fare's own logo is drawn in when the club has no mark for it: the size of the British Airways mark. */
const LOGO_BOX = { width: 81.6, height: 28.6 } as const;

/**
 * A flight option (13; 04, sheet 40): a white card on a hairline with a soft shadow. Its price says what it buys, as the
 * catalogue says (`round trip`, `one way`); times are the airports' own clocks, and a fare without them shows its
 * airports alone.
 */
export function FlightCard({ fare, layout, mark, onPress, testID }: Props) {
  const price = money(fare);
  const basis = fareBasis(fare.trip);
  const plusDays = fare.arriveDayOffset > 0 ? `+${fare.arriveDayOffset}` : null;
  const facts = flightFacts(fare);
  const label = [
    fare.carrier.name,
    fare.departLocal && fare.arriveLocal
      ? `${fare.from.code} ${fare.departLocal} to ${fare.to.code} ${fare.arriveLocal}${plusDays ? `, ${plusDays} day` : ""}`
      : `${fare.from.code} to ${fare.to.code}`,
    facts,
    [price, basis].filter(Boolean).join(" "),
  ].join(", ");

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        layout === "detailed" ? styles.detailed : styles.compact,
        pressed && styles.pressed,
      ]}
    >
      {layout === "detailed" ? (
        <Detailed fare={fare} mark={mark} price={price} basis={basis} plusDays={plusDays} />
      ) : (
        <Compact fare={fare} mark={mark} price={price} basis={basis} plusDays={plusDays} facts={facts} />
      )}
      {/* The hairline over the card's edge: drawn on top, it does not move what is measured from the card's corner. */}
      <View
        pointerEvents="none"
        style={[styles.edge, { borderRadius: layout === "detailed" ? DETAILED.radius : COMPACT.radius }]}
      />
    </Pressable>
  );
}

type Parts = { fare: FareVM; mark?: AirlineMark | null; price: string; basis: string | null; plusDays: string | null };

function Detailed({ fare, mark, price, basis, plusDays }: Parts) {
  const g = DETAILED;
  return (
    <>
      <Carrier
        fare={fare}
        mark={mark}
        style={{ position: "absolute", left: g.mark.left, top: g.mark.top }}
        nameStyle={{
          position: "absolute",
          left: g.departLeft,
          top: g.cabin.baseline - baselineOffset(g.cabin.role),
        }}
      />
      <Text
        style={[
          g.cabin.role,
          styles.slate,
          styles.absolute,
          { right: g.cabin.right, top: g.cabin.baseline - baselineOffset(g.cabin.role) },
        ]}
      >
        {cabinText(fare.cabin)}
      </Text>
      <View style={styles.row}>
        <View style={{ marginLeft: g.departLeft, width: g.line.left - g.departLeft }}>
          <AirportLines code={fare.from.code} time={fare.departLocal} day={dayText(departYmd(fare))} />
        </View>
        <FlightLine />
        <View style={{ marginLeft: g.arriveLeft - g.line.right, width: g.rule.left - g.arriveLeft }}>
          <AirportLines
            code={fare.to.code}
            time={fare.arriveLocal}
            plusDays={plusDays}
            day={dayText(arriveYmd(fare))}
          />
        </View>
      </View>
      <View
        style={[
          styles.rule,
          { left: g.rule.left, top: g.rule.top, height: g.rule.bottom - g.rule.top, width: g.rule.width },
        ]}
      />
      <View style={[styles.absolute, styles.priceRight, { right: 0, top: 0 }]}>
        <Text
          style={[
            g.price.role,
            styles.navy,
            { marginTop: g.price.baseline - baselineOffset(g.price.role), marginRight: g.price.right },
          ]}
          numberOfLines={1}
        >
          {price}
        </Text>
        {basis ? (
          <Text
            style={[
              g.basis.role,
              styles.slate,
              {
                marginTop: after(g.basis.baseline - g.price.baseline, g.price.role, g.basis.role),
                marginRight: g.basis.right,
              },
            ]}
          >
            {basis}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** 13: an airport's code, its clock (`+1` after it, in the same Bold) and its day. */
function AirportLines({
  code,
  time,
  day,
  plusDays = null,
}: {
  code: string;
  time: string | null;
  day: string | null;
  plusDays?: string | null;
}) {
  const g = DETAILED;
  return (
    <>
      <Text style={[g.code.role, styles.navy, { marginTop: g.code.baseline - baselineOffset(g.code.role) }]}>
        {code}
      </Text>
      {time ? (
        <Text
          style={[
            g.time.role,
            styles.navy,
            { marginTop: after(g.time.baseline - g.code.baseline, g.code.role, g.time.role) },
          ]}
        >
          {time}
          {plusDays ? <Text style={g.plus.role}>{` ${plusDays}`}</Text> : null}
        </Text>
      ) : null}
      {day ? (
        <Text
          style={[
            g.day.role,
            styles.slate,
            {
              marginTop: time
                ? after(g.day.baseline - g.time.baseline, g.time.role, g.day.role)
                : after(g.day.baseline - g.code.baseline, g.code.role, g.day.role),
            },
          ]}
        >
          {day}
        </Text>
      ) : null}
    </>
  );
}

/** 13: the line between the airports — two light slate strokes, the plane between them nose to the arrival, and the
 *  arrow's open head at its end. */
function FlightLine() {
  const { line } = DETAILED;
  const width = line.right - line.left;
  const h = 8;
  const y = h / 2;
  const s = line.stroke;
  const planeLeft = line.plane.left - line.left;
  const planeRight = line.plane.right - line.left;
  return (
    <View
      style={{ width, height: h, marginTop: line.y - y }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>
        <Path
          d={`M${s / 2} ${y}H${planeLeft - 2}M${planeRight + 2.5} ${y}H${width - s / 2}M${width - 3.5} ${y - 3.25}L${
            width - s / 2
          } ${y}L${width - 3.5} ${y + 3.25}`}
          stroke={tokens.colors.chevronLight}
          strokeWidth={s}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      {/* The plane's ink is 19 of its 24 units across, centred on 12.5, 12: a 17.7 box draws it 14 across, as 13 does. */}
      <View style={[styles.absolute, { left: (planeLeft + planeRight) / 2 - (12.5 * PLANE) / 24, top: y - PLANE / 2 }]}>
        <Icon name="plane-right-fill" size={PLANE} color={tokens.colors.textMuted} />
      </View>
    </View>
  );
}

function Compact({ fare, mark, price, basis, plusDays, facts }: Parts & { facts: string }) {
  const g = COMPACT;
  const timeTop = g.time.baseline - baselineOffset(g.time.role);
  return (
    <>
      <View style={styles.markColumn} pointerEvents="none">
        <Carrier fare={fare} mark={mark} compact />
      </View>
      <View style={{ marginLeft: g.departLeft }}>
        {fare.departLocal ? (
          <Text style={[g.time.role, styles.navy, { marginTop: timeTop }]}>{fare.departLocal}</Text>
        ) : null}
        <Text
          style={[
            fare.departLocal ? g.code.role : g.time.role,
            fare.departLocal ? styles.slate : styles.navy,
            {
              marginTop: fare.departLocal
                ? after(g.code.baseline - g.time.baseline, g.time.role, g.code.role)
                : timeTop,
            },
          ]}
        >
          {fare.from.code}
        </Text>
        <Text
          style={[
            g.meta.role,
            styles.slate,
            {
              marginTop: after(
                g.meta.baseline - g.code.baseline,
                fare.departLocal ? g.code.role : g.time.role,
                g.meta.role,
              ),
            },
          ]}
          numberOfLines={1}
        >
          {facts}
        </Text>
      </View>
      <View
        style={[styles.absolute, { left: g.arrow.left, top: g.time.baseline - g.arrow.rise - g.arrow.height / 2 }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <LongArrow />
      </View>
      <View style={[styles.absolute, { left: g.arriveLeft, top: 0 }]}>
        <View style={styles.timeRow}>
          <Text style={[g.time.role, styles.navy, { marginTop: timeTop }]}>{fare.arriveLocal ?? fare.to.code}</Text>
          {fare.arriveLocal && plusDays ? (
            <Text
              style={[
                g.plus.role,
                styles.slate,
                {
                  marginLeft: g.plus.gap,
                  marginTop: g.time.baseline - g.plus.rise - baselineOffset(g.plus.role),
                },
              ]}
            >
              {plusDays}
            </Text>
          ) : null}
        </View>
        {fare.arriveLocal ? (
          <Text
            style={[
              g.code.role,
              styles.slate,
              { marginTop: after(g.code.baseline - g.time.baseline, g.time.role, g.code.role) },
            ]}
          >
            {fare.to.code}
          </Text>
        ) : null}
      </View>
      <View style={[styles.absolute, { left: g.price.left, top: 0 }]}>
        <Text
          style={[g.price.role, styles.navy, { marginTop: g.price.baseline - baselineOffset(g.price.role) }]}
          numberOfLines={1}
        >
          {price}
        </Text>
        {basis ? (
          <Text
            style={[
              g.basis.role,
              styles.slate,
              { marginTop: after(g.basis.baseline - g.price.baseline, g.price.role, g.basis.role) },
            ]}
          >
            {basis}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** 04: the long thin arrow between the clocks, its head open. */
function LongArrow() {
  const { width, height, stroke } = COMPACT.arrow;
  const s = stroke / 2;
  const y = height / 2;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={`M${s} ${y}H${width - s}M${width - y} ${s}L${width - s} ${y}L${width - y} ${height - s}`}
        stroke={tokens.colors.textOnTint}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** The airline: the club's mark for it, else the fare's own logo, else its name — never a logo invented for it. */
function Carrier({
  fare,
  mark,
  compact = false,
  style,
  nameStyle,
}: {
  fare: FareVM;
  mark?: AirlineMark | null;
  compact?: boolean;
  style?: object;
  nameStyle?: object;
}) {
  if (mark) {
    return (
      <Image
        source={mark.source}
        style={[
          styles.mark,
          { width: mark.width, height: mark.height },
          compact && mark.nudge ? { transform: [{ translateX: mark.nudge.x }, { translateY: mark.nudge.y }] } : null,
          style,
        ]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (fare.carrier.logoUrl) {
    return (
      <Image
        source={{ uri: fare.carrier.logoUrl }}
        style={[LOGO_BOX, style]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text
      style={[styles.carrier, compact ? styles.carrierCompact : null, compact ? style : nameStyle]}
      numberOfLines={compact ? 2 : 1}
    >
      {fare.carrier.name}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.soft },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  detailed: { minHeight: DETAILED.height, borderRadius: DETAILED.radius },
  compact: { minHeight: COMPACT.height, borderRadius: COMPACT.radius, flexDirection: "row" },
  pressed: { opacity: 0.85 },
  absolute: { position: "absolute" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  rule: { position: "absolute", backgroundColor: tokens.colors.borderDefault },
  priceRight: { alignItems: "flex-end" },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  // The crops keep the image's own near-white card behind each mark: multiplied, it is the card's white.
  mark: { mixBlendMode: "multiply" },
  carrier: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  carrierCompact: { textAlign: "center", paddingHorizontal: tokens.space.xs },
  // The mark centred on its point (04): a column twice as wide and as tall as that point is from the corner.
  markColumn: {
    position: "absolute",
    left: 0,
    top: 0,
    width: COMPACT.mark.centreX * 2,
    height: COMPACT.mark.centreY * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: { flexDirection: "row", alignItems: "flex-start" },
});
