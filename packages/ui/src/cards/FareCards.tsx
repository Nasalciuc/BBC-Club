import { Image, StyleSheet, Text, View } from "react-native";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { PricePair } from "@bbc/shared/api/v1/proposals";

import { Icon } from "../icons";
import { RouteMap } from "../globe/RouteMap";
import { SavePill } from "../primitives/SavePill";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { ONE_WAY, arriveYmd, dayText, departYmd } from "./flight-facts";

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/**
 * `Your fare` (05; sheet 40 · 05 without the weather the club does not have): the price in `price-display`, `one way`
 * beside it, `Save 48%` at the right and, where the published fare is on record, what it is down from and where that
 * fare was published — a reference price always carries its source.
 */
export function YourFareCard({
  price,
  percent,
  testID,
}: {
  price: Pick<PricePair, "offer" | "published" | "publishedSource" | "currency">;
  /** `savingPercent` of the price; null shows no pill. */
  percent: number | null;
  testID?: string;
}) {
  const amount = money(price.offer, price.currency);
  const published = price.published != null ? money(price.published, price.currency) : null;
  const source = published ? price.publishedSource?.trim() || null : null;
  const spoken = [
    `Your fare ${amount} ${ONE_WAY}`,
    published ? `down from ${published}` : null,
    source,
    percent ? `save ${percent}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={styles.card} testID={testID} accessible accessibilityLabel={spoken}>
      <View style={styles.fareMain}>
        <Text style={styles.fareLabel}>Your fare</Text>
        <View style={styles.priceLine}>
          <Text style={styles.priceDisplay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {amount}
          </Text>
          <Text style={styles.small}>{ONE_WAY}</Text>
        </View>
        {published ? <Text style={styles.small}>{`Down from ${published}`}</Text> : null}
        {source ? <Text style={styles.caption}>{source}</Text> : null}
      </View>
      {percent ? <SavePill percent={percent} /> : null}
    </View>
  );
}

/**
 * `Flight overview` (05; sheet 40 · 07): the airline — its logo where the fare has one, its name — then both airports,
 * each its code over its city, its clock and its day, the plane's line between them. A fare without times shows the
 * airports alone.
 */
export function FlightOverview({ fare, testID }: { fare: FareVM; testID?: string }) {
  const plusDays = fare.arriveDayOffset > 0 ? `+${fare.arriveDayOffset}` : null;
  return (
    <View style={[styles.card, styles.column]} testID={testID}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Flight overview
      </Text>
      <View style={styles.overview}>
        <View style={styles.carrierColumn}>
          {fare.carrier.logoUrl ? (
            <Image
              source={{ uri: fare.carrier.logoUrl }}
              style={styles.logo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Text style={styles.small} numberOfLines={2}>
            {fare.carrier.name}
          </Text>
        </View>
        <View style={styles.legs}>
          <Airport code={fare.from.code} city={fare.from.city} time={fare.departLocal} day={dayText(departYmd(fare))} />
          <View style={styles.line} importantForAccessibility="no-hide-descendants">
            <View style={styles.stroke} />
            <View style={styles.plane}>
              <Icon name="plane-fill" size={18} color={tokens.colors.textPrimary} />
            </View>
            <View style={styles.stroke} />
          </View>
          <Airport
            code={fare.to.code}
            city={fare.to.city}
            time={fare.arriveLocal}
            plusDays={plusDays}
            day={dayText(arriveYmd(fare))}
          />
        </View>
      </View>
    </View>
  );
}

function Airport({
  code,
  city,
  time,
  day,
  plusDays = null,
}: {
  code: string;
  city: string;
  time: string | null;
  day: string | null;
  plusDays?: string | null;
}) {
  const spoken = [code, city, time ? `${time}${plusDays ? `, ${plusDays} day` : ""}` : null, day]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={styles.airport} accessible accessibilityLabel={spoken}>
      <Text style={styles.code}>{code}</Text>
      <Text style={styles.small} numberOfLines={1}>
        {city}
      </Text>
      {time ? (
        <Text style={styles.time}>
          {time}
          {plusDays ? <Text style={styles.plus}>{` ${plusDays}`}</Text> : null}
        </Text>
      ) : null}
      {time && day ? (
        <Text style={styles.small} numberOfLines={1}>
          {day}
        </Text>
      ) : null}
    </View>
  );
}

type Place = { code: string; city: string; lat: number; lng: number };

/** `The route` (05; sheet 40 · 08): the flight drawn on the land, the airports at either end. */
export function RouteCard({ from, to, testID }: { from: Place; to: Place; testID?: string }) {
  return (
    <View style={[styles.card, styles.routeCard]} testID={testID}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        The route
      </Text>
      <RouteMap from={from} to={to} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  fareMain: { flex: 1, gap: 2 },
  fareLabel: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  priceLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: tokens.space.xs },
  priceDisplay: { ...rn(tokens.type.priceDisplay), color: tokens.colors.textPrimary },
  small: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  column: { flexDirection: "column", alignItems: "stretch" },
  cardTitle: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  overview: { flexDirection: "row", gap: tokens.space.sm },
  // 05: the airline in its own column, its logo over its name, beside both airports.
  carrierColumn: { width: 84, gap: tokens.space.xs, paddingTop: tokens.space.xxs },
  logo: { height: 20, width: 80 },
  legs: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: tokens.space.xs },
  airport: { flexShrink: 1 },
  code: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  time: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary, marginTop: tokens.space.xxs },
  plus: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  line: { flex: 1, minWidth: 28, flexDirection: "row", alignItems: "center", marginTop: 12 },
  stroke: { flex: 1, height: 1, backgroundColor: tokens.colors.textSecondary },
  plane: { transform: [{ rotate: "90deg" }], marginHorizontal: 2 },
  routeCard: { flexDirection: "column", alignItems: "stretch" },
});
