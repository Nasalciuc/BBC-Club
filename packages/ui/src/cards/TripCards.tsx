import { Image, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Carrier = { name: string; logoUrl: string | null };

/** The airline's logo where the fare has one; its name otherwise — never a logo invented for it (ADR-IMPL-055). */
function CarrierMark({ carrier, align = "right" }: { carrier: Carrier; align?: "right" | "left" }) {
  if (carrier.logoUrl) {
    return (
      <Image
        source={{ uri: carrier.logoUrl }}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel={carrier.name}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text style={[styles.carrier, align === "right" && styles.right]} numberOfLines={2}>
      {carrier.name}
    </Text>
  );
}

type SummaryProps = {
  photo: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `New York to London`. */
  title: string;
  /** `Business`. */
  cabin: string;
  /** The trip's days as the sheet holds them now (`Nov 12 – 19, 2026`). */
  dates: string;
  /** `JFK 18:55 → LHR 07:00 +1` for a fare with its clocks; `JFK → LHR` otherwise. */
  route: string;
  /** A fare's airline; a quote has none yet. */
  carrier?: Carrier | null;
  /** A fare's price (`$4,200`) — `one way` — and, where the published fare is on record, its saving; a quote has none. */
  price?: { amount: string; percent: number | null } | null;
  testID?: string;
};

/**
 * The trip at the top of the request sheet (06; sheet 40 · 02): the city's photograph; the route by its cities over the
 * cabin, the airline at the right; under a rule, the days and the flight's clocks, and beside them the fare and what it
 * saves. A fare is one way and says so.
 */
export function TripSummaryCard({ photo, fallback, title, cabin, dates, route, carrier, price, testID }: SummaryProps) {
  // The airline's logo stands at the right (06); its name, where it has no logo, follows the cabin.
  const logo = carrier?.logoUrl ? carrier : null;
  const cabinLine = carrier && !logo ? `${cabin} · ${carrier.name}` : cabin;
  const spoken = [
    title,
    cabin,
    carrier?.name,
    dates,
    route.replace(/→/g, "to"),
    price ? `${price.amount} one way` : null,
    price?.percent ? `save ${price.percent}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={styles.card} testID={testID} accessible accessibilityLabel={spoken}>
      <Photo source={photo} fallback={fallback} style={styles.summaryPhoto} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.grow}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.small}>{cabinLine}</Text>
          </View>
          {logo ? (
            <View style={styles.carrierBox}>
              <CarrierMark carrier={logo} />
            </View>
          ) : null}
        </View>
        <View style={styles.rule} />
        <View style={styles.bottom}>
          <View style={styles.grow}>
            <Text style={styles.dates}>{dates}</Text>
            <Text style={styles.caption}>{route}</Text>
          </View>
          {price ? (
            <>
              <View style={styles.vrule} />
              <View style={styles.price}>
                <Text style={styles.amount} numberOfLines={1}>
                  {price.amount}
                </Text>
                <Text style={styles.caption}>one way</Text>
                {price.percent ? <Text style={styles.save}>{`Save ${price.percent}%`}</Text> : null}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type TripProps = {
  photo: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `BUSINESS CLASS`. */
  cabin: string;
  from: string;
  to: string;
  /** `Nov 12 – 19, 2026`. */
  dates: string | null;
  /** `Round trip · 1 adult`. */
  facts: string | null;
  carrier?: Carrier | null;
  testID?: string;
};

/**
 * The request just received (08, `London is next.`): the city's photograph, the cabin over the route in its codes, the
 * days and the trip under it, the airline at the right where the request came from a fare.
 */
export function TripCard({ photo, fallback, cabin, from, to, dates, facts, carrier, testID }: TripProps) {
  const spoken = [cabin, `${from} to ${to}`, dates, facts, carrier?.name].filter(Boolean).join(", ");
  return (
    <View style={styles.card} testID={testID} accessible accessibilityLabel={spoken}>
      <Photo source={photo} fallback={fallback} style={styles.tripPhoto} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.label, styles.grow]}>{cabin}</Text>
          {carrier ? (
            <View style={styles.carrierBox}>
              <CarrierMark carrier={carrier} />
            </View>
          ) : null}
        </View>
        <View style={styles.route}>
          <Text style={styles.codes}>{from}</Text>
          <Icon name="arrow-right" size={20} color={tokens.colors.textPrimary} strokeWidth={2} />
          <Text style={styles.codes}>{to}</Text>
        </View>
        {dates ? <Text style={styles.small}>{dates}</Text> : null}
        {facts ? <Text style={styles.small}>{facts}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: tokens.space.sm,
    padding: tokens.space.xs,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  summaryPhoto: { width: 76, minHeight: 76, borderRadius: tokens.radius.sm },
  tripPhoto: { width: 120, minHeight: 96, borderRadius: tokens.radius.sm },
  body: { flex: 1, gap: tokens.space.xxs, paddingVertical: tokens.space.xxs, paddingRight: tokens.space.xxs },
  top: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.xs },
  grow: { flex: 1 },
  title: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  small: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  // The airline at the right in two lines at most (08: `British Airways` over itself), the cabin keeping its line.
  carrierBox: { maxWidth: 76, alignItems: "flex-end" },
  carrier: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textPrimary,
    fontFamily: rn(tokens.type.labelStrong).fontFamily,
  },
  right: { textAlign: "right" },
  logo: { height: 18, width: 80 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: tokens.colors.borderDefault, marginVertical: 2 },
  bottom: { flexDirection: "row", alignItems: "stretch", gap: tokens.space.xs },
  dates: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  vrule: { width: StyleSheet.hairlineWidth * 2, backgroundColor: tokens.colors.borderDefault },
  price: { alignItems: "flex-start" },
  amount: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  save: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textPrimary,
    fontFamily: rn(tokens.type.labelStrong).fontFamily,
  },
  label: { ...rn(tokens.type.label), color: tokens.colors.textSecondary },
  route: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
  codes: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
});
