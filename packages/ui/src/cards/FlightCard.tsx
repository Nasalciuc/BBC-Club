import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { FareVM } from "@bbc/shared/api/v1/fares";

import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { ONE_WAY, arriveYmd, cabinText, dayText, departYmd, flightFacts } from "./flight-facts";

type Props = {
  fare: FareVM;
  /**
   * `detailed` (13): one fare on its own — the airline and the cabin over both airports with their times and days, the
   * price at the right. `compact` (04, sheet 40): one of several — the airline at the left, the times over the codes
   * and the stops, the price at the right.
   */
  layout: "detailed" | "compact";
  onPress: () => void;
  testID: string;
};

const money = (fare: FareVM) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: fare.price.currency, maximumFractionDigits: 0 }).format(
    fare.price.offer,
  );

/**
 * A flight option (sheet 40 · 04, image 13): a white card with the card shadow. Its price says `one way` — a fare is one
 * flight (ADR-IMPL-055). Times are the airports' own clocks; a fare without them shows its airports alone.
 */
export function FlightCard({ fare, layout, onPress, testID }: Props) {
  const price = money(fare);
  const plusDays = fare.arriveDayOffset > 0 ? `+${fare.arriveDayOffset}` : null;
  const facts = flightFacts(fare);
  const label = [
    fare.carrier.name,
    fare.departLocal && fare.arriveLocal
      ? `${fare.from.code} ${fare.departLocal} to ${fare.to.code} ${fare.arriveLocal}${plusDays ? `, ${plusDays} day` : ""}`
      : `${fare.from.code} to ${fare.to.code}`,
    facts,
    `${price} ${ONE_WAY}`,
  ].join(", ");

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, layout === "compact" && styles.compactCard, pressed && styles.pressed]}
    >
      {layout === "detailed" ? (
        <>
          <View style={styles.top}>
            <CarrierMark fare={fare} />
            <Text style={styles.cabin}>{cabinText(fare.cabin)}</Text>
          </View>
          <View style={styles.row}>
            <Airport code={fare.from.code} time={fare.departLocal} day={dayText(departYmd(fare))} />
            <FlightLine />
            <Airport code={fare.to.code} time={fare.arriveLocal} plusDays={plusDays} day={dayText(arriveYmd(fare))} />
            <View style={styles.rule} />
            <Price price={price} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <View style={styles.markColumn}>
            <CarrierMark fare={fare} compact />
          </View>
          <View style={styles.middle}>
            <View style={styles.times}>
              <View>
                <Text style={styles.time}>{fare.departLocal ?? fare.from.code}</Text>
                {fare.departLocal ? <Text style={styles.small}>{fare.from.code}</Text> : null}
              </View>
              <Icon name="arrow-right" size={24} color={tokens.colors.textPrimary} strokeWidth={1.25} />
              <View>
                <Text style={styles.time}>
                  {fare.arriveLocal ?? fare.to.code}
                  {fare.arriveLocal && plusDays ? <Text style={styles.plus}>{` ${plusDays}`}</Text> : null}
                </Text>
                {fare.arriveLocal ? <Text style={styles.small}>{fare.to.code}</Text> : null}
              </View>
            </View>
            <Text style={styles.small} numberOfLines={1}>
              {facts}
            </Text>
          </View>
          <Price price={price} />
        </View>
      )}
    </Pressable>
  );
}

/** The airline's logo when the fare carries one; its name otherwise — never a logo invented for it (ADR-IMPL-055). */
function CarrierMark({ fare, compact = false }: { fare: FareVM; compact?: boolean }) {
  if (fare.carrier.logoUrl) {
    return (
      <Image
        source={{ uri: fare.carrier.logoUrl }}
        style={compact ? styles.logoCompact : styles.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text style={styles.carrier} numberOfLines={compact ? 2 : 1}>
      {fare.carrier.name}
    </Text>
  );
}

function Airport({
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
  return (
    <View style={styles.airport}>
      <Text style={styles.code}>{code}</Text>
      {time ? (
        <Text style={styles.code}>
          {time}
          {plusDays ? <Text style={styles.plus}>{` ${plusDays}`}</Text> : null}
        </Text>
      ) : null}
      {day ? <Text style={styles.small}>{day}</Text> : null}
    </View>
  );
}

/** 13: a slate line with the plane on it, toward the arrival. */
function FlightLine() {
  return (
    <View style={styles.line} importantForAccessibility="no-hide-descendants">
      <View style={styles.stroke} />
      <View style={styles.planeRight}>
        <Icon name="plane-fill" size={18} color={tokens.colors.textSecondary} />
      </View>
      <View style={styles.stroke} />
      <Icon name="arrow-right" size={14} color={tokens.colors.textSecondary} strokeWidth={1.5} />
    </View>
  );
}

function Price({ price }: { price: string }) {
  return (
    <View style={styles.price}>
      <Text style={styles.amount} numberOfLines={1}>
        {price}
      </Text>
      <Text style={styles.small}>{ONE_WAY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    gap: tokens.space.xs,
    ...tokens.elevation.card,
  },
  compactCard: { paddingVertical: tokens.space.sm },
  pressed: { opacity: 0.85 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  cabin: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  airport: { gap: 0 },
  code: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  plus: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  small: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  line: { flex: 1, minWidth: 48, flexDirection: "row", alignItems: "center" },
  stroke: { flex: 1, height: 1, backgroundColor: tokens.colors.textSecondary },
  planeRight: { transform: [{ rotate: "90deg" }] },
  rule: { width: 1, alignSelf: "stretch", backgroundColor: tokens.colors.borderDefault },
  price: { alignItems: "flex-end", gap: 2 },
  amount: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  carrier: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary, flexShrink: 1 },
  logo: { height: 18, width: 132 },
  logoCompact: { height: 24, width: 80 },
  markColumn: { width: 84, alignItems: "flex-start" },
  middle: { flex: 1, gap: 2 },
  times: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.xs },
  time: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
});
