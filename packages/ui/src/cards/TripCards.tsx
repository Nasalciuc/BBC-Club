import type { ImageContentPosition } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
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
 * 9.2 from the right, its middle on 19.8; the rule on 44.9 from 100 to 8.7 short of the right; the days on 63.7 and the
 * clocks on 78; the rule between them and the fare at 265.8, from the rule down to 9 over the foot; the price 280.7
 * in on 63, the published fare struck on 78.8 with the saving at the right, where it was published on 86.
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
  rule: { y: 44.65, left: 100, right: 8.74 },
  dates: { role: role(tokens.type.summaryDates), baseline: 63.69 },
  route: { role: role(tokens.type.summaryRoute), baseline: 78.04 },
  vrule: { left: 265.79, bottom: 9 },
  price: { left: 280.7, role: role(tokens.type.summaryPrice), baseline: 62.98 },
  published: { role: role(tokens.type.summaryPublished), baseline: 78.4, gap: 5.4 },
  save: { right: 9.24, role: role(tokens.type.summarySave) },
  source: { role: role(tokens.type.summarySource), baseline: 86 },
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
      <View style={[summary.rule, { top: g.rule.y, left: g.rule.left, right: g.rule.right }]} />
      <View
        style={[
          summary.absolute,
          { left: g.text, top: 0 },
          price ? { width: g.vrule.left - g.text - 6 } : { right: g.rule.right },
        ]}
        pointerEvents="none"
      >
        <Text
          style={[g.dates.role, summary.navy, { marginTop: topOf(g.dates.baseline, g.dates.role) }]}
          numberOfLines={1}
        >
          {dates}
        </Text>
        <Text
          style={[
            g.route.role,
            summary.muted,
            {
              marginTop:
                g.route.baseline - g.dates.baseline - belowBaseline(g.dates.role) - baselineOffset(g.route.role),
            },
          ]}
          numberOfLines={1}
        >
          {route}
        </Text>
      </View>
      {price ? (
        <>
          <View
            style={[
              summary.vrule,
              { left: g.vrule.left, top: g.rule.y + StyleSheet.hairlineWidth, bottom: g.vrule.bottom },
            ]}
          />
          <View style={[summary.absolute, { left: g.price.left, right: g.save.right, top: 0 }]}>
            <Text
              style={[g.price.role, summary.navy, { marginTop: topOf(g.price.baseline, g.price.role) }]}
              numberOfLines={1}
            >
              {price.amount}
            </Text>
            <View
              style={[
                summary.row,
                {
                  marginTop:
                    g.published.baseline -
                    g.price.baseline -
                    belowBaseline(g.price.role) -
                    baselineOffset(g.published.role),
                },
              ]}
            >
              {price.published ? (
                <Text style={[g.published.role, summary.muted, summary.struck]} numberOfLines={1}>
                  {price.published}
                </Text>
              ) : null}
              <View style={summary.grow} />
              {price.percent ? (
                <Text
                  style={[
                    g.save.role,
                    summary.save,
                    { marginTop: baselineOffset(g.published.role) - baselineOffset(g.save.role) },
                  ]}
                  numberOfLines={1}
                >
                  {`Save ${price.percent}%`}
                </Text>
              ) : null}
            </View>
            {price.published && price.source ? (
              <Text
                style={[
                  g.source.role,
                  summary.muted,
                  {
                    marginTop:
                      g.source.baseline -
                      g.published.baseline -
                      belowBaseline(g.published.role) -
                      baselineOffset(g.source.role),
                  },
                ]}
                numberOfLines={1}
              >
                {price.source}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
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
  rule: { position: "absolute", height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderDefault },
  vrule: { position: "absolute", width: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderDefault },
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
          <Text style={styles.photoDates} numberOfLines={1}>
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
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: tokens.space.sm,
    padding: tokens.space.xs,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  // 12: four to the screen's width. Larger text makes the cards taller, never cut: the city alone keeps one line.
  photoCard: {
    width: 89.4,
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
