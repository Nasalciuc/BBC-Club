import type { ImageContentPosition } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import type { AirlineRibbon } from "./FarePage";
import type { AirlineMark } from "./FlightCard";

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
  /** The trip's days as the sheet holds them now (`Nov 12 – Nov 19, 2026`). */
  dates: string;
  /** `JFK 18:55 → LHR 07:05 +1` for a fare with its clocks; `JFK → LHR` otherwise. */
  route: string;
  /** A fare's airline; a quote has none yet. */
  carrier?: Carrier | null;
  /** The design's own mark of that airline (British Airways, Virgin Atlantic, American), drawn at the right. */
  mark?: AirlineMark | null;
  /**
   * A fare's price; where the published fare is on record, that fare struck beside what the club's saves (`$7,550 Save
   * 48%`) and, under them, where it was published; a quote has none.
   */
  price?: { amount: string; percent: number | null; published?: string | null; source?: string | null } | null;
  testID?: string;
};

type Role = TextStyle & { fontSize: number; lineHeight: number };
const role = (t: (typeof tokens.type)[keyof typeof tokens.type]) => rn(t) as Role;

/**
 * 06, from the card's top-left (pt; 359.5 × 90.1, radius 8.6, on a hairline): the photograph 9 in all round, 79.9 ×
 * 72.05, radius 5.5; the words from 100.35 — the route by its cities on 22.3, the cabin on 35.8; the airline's mark
 * 9.2 from the right, its middle on 19.8; then a rule from 100 to 8.7 short of the right. Under it 06 draws the days
 * and clocks beside the fare's column at fixed baselines; at the reading sizes (ADR-IMPL-057) that part flows, and the
 * card grows with it.
 */
const SUMMARY = {
  height: 90.06,
  radius: 8.6,
  photo: { inset: 9, width: 79.9, height: 72.05, radius: 5.5 },
  text: 100.35,
  title: { role: role(tokens.type.summaryTitle), baseline: 22.27 },
  cabin: { role: role(tokens.type.summaryCabin), baseline: 35.79 },
  // The mark's crop drawn 0.833 its size (06's British Airways), never taller than 24 pt.
  mark: { right: 5, centre: 19.84, scale: 0.833, maxHeight: 24 },
  rule: { right: 8.74 },
  dates: { role: role(tokens.type.summaryDates) },
  route: { role: role(tokens.type.summaryRoute) },
  price: { role: role(tokens.type.summaryPrice) },
  published: { role: role(tokens.type.summaryPublished) },
  save: { right: 9.24, role: role(tokens.type.summarySave) },
  source: { role: role(tokens.type.summarySource) },
} as const;
const topOf = (baseline: number, r: Role) => baseline - baselineOffset(r);

/**
 * The trip at the top of the request sheet (06; sheet 40 · 02): the city's photograph; the route by its cities over the
 * cabin, the airline's mark at the right; under a rule, the days and the flight's clocks, and beside them the fare and
 * what it saves.
 */
export function TripSummaryCard({
  photo,
  fallback,
  title,
  cabin,
  dates,
  route,
  carrier,
  mark,
  price,
  testID,
}: SummaryProps) {
  const g = SUMMARY;
  // The airline's mark stands at the right (06); its logo where it has one; its name, without either, follows the cabin.
  const logo = !mark && carrier?.logoUrl ? carrier : null;
  const cabinLine = carrier && !mark && !logo ? `${cabin} · ${carrier.name}` : cabin;
  const k = mark ? Math.min(g.mark.scale, g.mark.maxHeight / mark.height) : 0;
  const spoken = [
    title,
    cabin,
    carrier?.name,
    dates,
    route.replace(/→/g, "to"),
    price?.amount,
    price?.published ? `down from ${price.published}, published by ${price.source}` : null,
    price?.percent ? `save ${price.percent}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <View
      style={[summary.card, { minHeight: g.height, borderRadius: g.radius }]}
      testID={testID}
      accessible
      accessibilityLabel={spoken}
    >
      <Photo
        source={photo}
        fallback={fallback}
        style={[
          summary.photo,
          {
            left: g.photo.inset,
            top: g.photo.inset,
            width: g.photo.width,
            height: g.photo.height,
            borderRadius: g.photo.radius,
          },
        ]}
      />
      <View style={{ marginLeft: g.text, marginRight: mark ? mark.width * k + g.mark.right + 4 : 12 }}>
        <Text
          style={[g.title.role, summary.navy, { marginTop: topOf(g.title.baseline, g.title.role) }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={[
            g.cabin.role,
            summary.label,
            {
              marginTop:
                g.cabin.baseline - g.title.baseline - belowBaseline(g.title.role) - baselineOffset(g.cabin.role),
            },
          ]}
          numberOfLines={1}
        >
          {cabinLine}
        </Text>
      </View>
      {mark ? (
        <Image
          source={mark.source}
          style={[
            summary.mark,
            {
              right: g.mark.right,
              top: g.mark.centre - (mark.height * k) / 2,
              width: mark.width * k,
              height: mark.height * k,
            },
          ]}
          accessibilityIgnoresInvertColors
        />
      ) : logo ? (
        <View style={[summary.mark, { right: g.save.right, top: g.mark.centre - 9 }]}>
          <CarrierMark carrier={logo} />
        </View>
      ) : null}
      {/* ADR-IMPL-057: at the reading sizes the days, the clocks and the fare no longer fit the columns 06 draws them in:
          under the rule they flow — the days and clocks beside the fare, which keeps its own column — and the card
          grows with them instead of cutting them. */}
      <View style={[summary.lower, { marginLeft: g.text, marginRight: g.rule.right }]}>
        <View style={summary.rule} />
        <View style={summary.lowerRow}>
          <View style={summary.days}>
            <Text style={[g.dates.role, summary.navy]} numberOfLines={1}>
              {dates}
            </Text>
            <Text style={[g.route.role, summary.muted, summary.lineGap]} numberOfLines={2}>
              {route}
            </Text>
          </View>
          {price ? (
            <View style={summary.fare}>
              <Text style={[g.price.role, summary.navy]} numberOfLines={1}>
                {price.amount}
              </Text>
              {price.published ? (
                <Text style={[g.published.role, summary.muted, summary.struck, summary.lineGap]} numberOfLines={1}>
                  {price.published}
                </Text>
              ) : null}
              {price.percent ? (
                <Text style={[g.save.role, summary.save, summary.lineGap]} numberOfLines={1}>
                  {`Save ${price.percent}%`}
                </Text>
              ) : null}
              {price.published && price.source ? (
                <Text style={[g.source.role, summary.muted, summary.lineGap]} numberOfLines={1}>
                  {price.source}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <View pointerEvents="none" style={[summary.edge, { borderRadius: g.radius }]} />
    </View>
  );
}

const summary = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.soft },
  absolute: { position: "absolute" },
  photo: { position: "absolute" },
  navy: { color: tokens.colors.textPrimary },
  label: { color: tokens.colors.textLabel },
  muted: { color: tokens.colors.textMuted },
  struck: { textDecorationLine: "line-through" },
  save: { color: tokens.colors.textLink },
  row: { flexDirection: "row", alignItems: "flex-start" },
  grow: { flex: 1 },
  mark: { position: "absolute" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderDefault },
  lower: { marginTop: 8, paddingBottom: 9 },
  lowerRow: { flexDirection: "row", marginTop: 7, gap: 10 },
  days: { flex: 1, minWidth: 0 },
  // The fare's own column on a hairline at its left, as 06 draws it beside the days.
  fare: {
    width: 92,
    paddingLeft: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.colors.borderDefault,
  },
  lineGap: { marginTop: 2 },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
});

type TripProps = {
  photo: PhotoSource | null;
  /** The part of the photograph the card shows (08: London's from 35 % of its height, cover fit). */
  position?: ImageContentPosition;
  fallback: PhotoSource | null;
  /** `BUSINESS CLASS`. */
  cabin: string;
  from: string;
  to: string;
  /** `Nov 12 – 19, 2026`. */
  dates: string | null;
  /** `Round trip`, `1 adult`: drawn with a dot between them. */
  facts: readonly string[];
  carrier?: Carrier | null;
  /** The airline's ribbon alone (British Airways): drawn over its name in capitals, as 08 draws the lockup. */
  ribbon?: AirlineRibbon | null;
  /** The airline's whole mark where the design draws one (Virgin Atlantic, American). */
  mark?: AirlineMark | null;
  testID?: string;
};

/**
 * 08, from the card's top-left (pt; 351 wide on the page's 21.2 gutters, 96.8 tall, radius 9, on a hairline): the
 * photograph 5.1 in and 5.5 down, 123.3 × 86.8, radius 8.2; the words from 140.6 — `BUSINESS CLASS` on 17.86, the
 * codes on 43 with the arrow (17.06 at 2.1) 12.5 after the first and 12.4 before the second, centred on their line;
 * the days on 63.43, the trip and the travelers on 79.02 with a 2.3-pt dot 5.66 after the trip and 7.13 before the
 * travelers, its middle 3.8 over the baseline. The airline at the right around x 317.4: the ribbon's window 1.1 its
 * crop's size centred 20.37 down, the name in capitals under it, a word to a line, on 35.15 and 43.95.
 */
const RECEIVED = {
  height: 96.8,
  radius: 9,
  photo: { left: 5.12, top: 5.5, width: 123.3, height: 86.8, radius: 8.2 },
  text: 140.6,
  cabin: { role: role(tokens.type.receivedTripLabel), baseline: 17.86 },
  codes: { role: role(tokens.type.receivedTripCodes), baseline: 43.0 },
  arrow: { size: 17.06, stroke: 2.1, before: 12.5, after: 12.42 },
  dates: { role: role(tokens.type.receivedTripDates), baseline: 63.43 },
  facts: { role: role(tokens.type.receivedTripFacts), baseline: 79.02 },
  dot: { size: 2.3, rise: 3.79, before: 5.66, after: 7.13 },
  airline: { centre: 317.4, width: 64, ribbon: { middle: 20.37, scale: 1.1 }, mark: { middle: 29.75 } },
  name: { role: role(tokens.type.receivedAirline), first: 35.15, pitch: 8.8 },
} as const;

/**
 * The request just received (08, `London is next.`): the city's photograph, the cabin over the route in its codes, the
 * days and the trip under it, the airline at the right where the request came from a fare — the ribbon over its name,
 * its mark, its logo or its name, never one made up for it.
 */
export function TripCard({
  photo,
  position,
  fallback,
  cabin,
  from,
  to,
  dates,
  facts,
  carrier,
  ribbon,
  mark,
  testID,
}: TripProps) {
  const g = RECEIVED;
  const spoken = [cabin, `${from} to ${to}`, dates, ...facts, carrier?.name].filter(Boolean).join(", ");
  const right = carrier || mark ? g.airline.width + 8 : 12;
  return (
    <View
      style={[received.card, { minHeight: g.height, borderRadius: g.radius }]}
      testID={testID}
      accessible
      accessibilityLabel={spoken}
    >
      <Photo
        source={photo}
        fallback={fallback}
        position={position}
        style={[
          received.absolute,
          {
            left: g.photo.left,
            top: g.photo.top,
            width: g.photo.width,
            height: g.photo.height,
            borderRadius: g.photo.radius,
          },
        ]}
      />
      <View style={{ marginLeft: g.text, marginRight: right }}>
        <Text
          style={[g.cabin.role, received.label, { marginTop: topOf(g.cabin.baseline, g.cabin.role) }]}
          numberOfLines={1}
        >
          {cabin}
        </Text>
        <View
          style={[
            received.row,
            {
              marginTop:
                g.codes.baseline - g.cabin.baseline - belowBaseline(g.cabin.role) - baselineOffset(g.codes.role),
            },
          ]}
        >
          <Text style={[g.codes.role, received.navy]}>{from}</Text>
          <View style={{ marginLeft: g.arrow.before, marginRight: g.arrow.after }}>
            <Icon
              name="arrow-right"
              size={g.arrow.size}
              color={tokens.colors.textPrimary}
              strokeWidth={g.arrow.stroke}
            />
          </View>
          <Text style={[g.codes.role, received.navy]}>{to}</Text>
        </View>
        {dates ? (
          <Text
            style={[
              g.dates.role,
              received.slate,
              {
                marginTop:
                  g.dates.baseline - g.codes.baseline - belowBaseline(g.codes.role) - baselineOffset(g.dates.role),
              },
            ]}
            numberOfLines={1}
          >
            {dates}
          </Text>
        ) : null}
        {facts.length > 0 ? (
          <View
            style={[
              received.row,
              received.start,
              {
                marginTop:
                  g.facts.baseline -
                  (dates ? g.dates.baseline : g.codes.baseline) -
                  belowBaseline(dates ? g.dates.role : g.codes.role) -
                  baselineOffset(g.facts.role),
              },
            ]}
          >
            {facts.map((fact, i) => (
              <View key={fact} style={received.row}>
                {i > 0 ? (
                  <View
                    style={[
                      received.dot,
                      {
                        marginLeft: g.dot.before,
                        marginRight: g.dot.after,
                        marginTop: baselineOffset(g.facts.role) - g.dot.rise - g.dot.size / 2,
                      },
                    ]}
                  />
                ) : null}
                <Text style={[g.facts.role, received.slate]}>{fact}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <ReceivedAirline carrier={carrier ?? null} ribbon={ribbon ?? null} mark={mark ?? null} />
      <View pointerEvents="none" style={[summary.edge, { borderRadius: g.radius }]} />
    </View>
  );
}

/** 08's airline at the card's right: the ribbon over the name, a word to a line; else the mark, the logo, the name. */
function ReceivedAirline({
  carrier,
  ribbon,
  mark,
}: {
  carrier: Carrier | null;
  ribbon: AirlineRibbon | null;
  mark: AirlineMark | null;
}) {
  const g = RECEIVED;
  const column = { left: g.airline.centre - g.airline.width / 2, width: g.airline.width };
  if (ribbon && carrier) {
    const k = g.airline.ribbon.scale;
    const w = ribbon.window.width * k;
    const h = ribbon.window.height * k;
    const top = g.airline.ribbon.middle - h / 2;
    const words = carrier.name.toUpperCase().split(/\s+/).filter(Boolean);
    return (
      <View
        style={[received.absolute, received.centre, column, { top: 0 }]}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[received.window, { width: w, height: h, marginTop: top }]}>
          <Image
            source={ribbon.source}
            style={[
              received.absolute,
              {
                width: ribbon.width * k,
                height: ribbon.height * k,
                left: -ribbon.window.left * k,
                top: -ribbon.window.top * k,
              },
            ]}
            accessibilityIgnoresInvertColors
          />
        </View>
        {words.map((word, i) => (
          <Text
            key={`${word}-${i}`}
            style={[
              g.name.role,
              received.airline,
              {
                marginTop:
                  i === 0
                    ? g.name.first - (top + h) - baselineOffset(g.name.role)
                    : g.name.pitch - belowBaseline(g.name.role) - baselineOffset(g.name.role),
              },
            ]}
            numberOfLines={1}
          >
            {word}
          </Text>
        ))}
      </View>
    );
  }
  if (mark) {
    // Never wider than the airline's column: a logo in the British Airways mark's box comes down to it.
    const k = Math.min(1, g.airline.width / mark.width);
    return (
      <Image
        source={mark.source}
        resizeMode="contain"
        style={[
          received.absolute,
          {
            left: g.airline.centre - (mark.width * k) / 2,
            top: g.airline.mark.middle - (mark.height * k) / 2,
            width: mark.width * k,
            height: mark.height * k,
          },
        ]}
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (!carrier) return null;
  return (
    <View
      style={[
        received.absolute,
        received.centre,
        column,
        { top: g.airline.mark.middle - 12, height: 24, justifyContent: "center" },
      ]}
    >
      {carrier.logoUrl ? (
        <CarrierMark carrier={carrier} />
      ) : (
        <Text style={[g.name.role, received.airline, received.centreText]} numberOfLines={2}>
          {carrier.name}
        </Text>
      )}
    </View>
  );
}

const received = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.soft },
  absolute: { position: "absolute" },
  row: { flexDirection: "row", alignItems: "center" },
  start: { alignItems: "flex-start" },
  centre: { alignItems: "center" },
  centreText: { textAlign: "center" },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  label: { color: tokens.colors.textSecondary },
  airline: { color: tokens.colors.textSubtle },
  dot: {
    width: RECEIVED.dot.size,
    height: RECEIVED.dot.size,
    borderRadius: RECEIVED.dot.size / 2,
    backgroundColor: tokens.colors.textSecondary,
    alignSelf: "flex-start",
  },
  window: { overflow: "hidden" },
});

type PhotoCardProps = {
  photo: PhotoSource | null;
  /** The part of a wide photograph the card shows (12: London's window from 34 % of its width). */
  position?: ImageContentPosition;
  fallback: PhotoSource | null;
  /** `memory` for a satellite view (its terms ask that it not be kept). */
  cachePolicy?: "memory" | "disk";
  /** `London`. */
  city: string;
  /** `Nov 12 – 19`; null when the request names no day. */
  dates: string | null;
  /** `JFK → LHR`. */
  route: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID: string;
};

/**
 * A trip on Profile (12, `My trips`; sheet 40 · 12), measured: 89.4 × 135, radius 8; the city's photograph darkened
 * from 42 % of its height to its foot; the words 8 pt in, in white — the city's baseline 32.6 pt above the foot, the
 * days' 19.9, the route's 8.1. The whole card opens the request.
 */
export function TripPhotoCard({
  photo,
  position,
  fallback,
  cachePolicy = "disk",
  city,
  dates,
  route,
  onPress,
  accessibilityLabel,
  testID,
}: PhotoCardProps) {
  const spoken = accessibilityLabel ?? [city, dates, route.replace(/→/g, "to")].filter(Boolean).join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.photoCard, pressed && styles.pressed]}
    >
      <Photo
        source={photo}
        fallback={fallback}
        cachePolicy={cachePolicy}
        position={position}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", tokens.colors.photoVeil]}
        locations={[0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.photoText}>
        <Text style={styles.photoCity} numberOfLines={1}>
          {city}
        </Text>
        {dates ? (
          // A long range (`Nov 10 – 17, 2026`) takes a second line at the reading sizes, never an ellipsis.
          <Text style={styles.photoDates} numberOfLines={2}>
            {dates}
          </Text>
        ) : null}
        <Text style={styles.photoRoute} numberOfLines={1}>
          {route}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 12 draws four to the screen's width; at the club's reading sizes (ADR-IMPL-057) three, so the days fit on their
  // line. Larger text still makes the cards taller, never cut: the city alone keeps one line.
  photoCard: {
    width: 112,
    minHeight: 135,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: tokens.colors.surfaceTint,
  },
  pressed: { opacity: 0.85 },
  photoText: { paddingLeft: 8, paddingRight: 6, paddingBottom: 8.1 - belowBaseline(tokens.type.tripRoute) },
  photoCity: { ...rn(tokens.type.tripCity), color: tokens.colors.textOnPhoto },
  photoDates: {
    ...rn(tokens.type.tripDates),
    color: tokens.colors.textOnPhoto,
    marginTop: 32.6 - 19.9 - belowBaseline(tokens.type.tripCity) - baselineOffset(tokens.type.tripDates),
  },
  photoRoute: {
    ...rn(tokens.type.tripRoute),
    color: tokens.colors.textOnPhoto,
    marginTop: 19.9 - 8.1 - belowBaseline(tokens.type.tripDates) - baselineOffset(tokens.type.tripRoute),
  },
  carrier: {
    ...rn(tokens.type.caption),
    color: tokens.colors.textPrimary,
    fontFamily: rn(tokens.type.labelStrong).fontFamily,
  },
  right: { textAlign: "right" },
  logo: { height: 18, width: 80 },
});
