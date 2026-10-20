import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { SavePill } from "../primitives/SavePill";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The destination's city (`Paris`). */
  city: string;
  /** Its country (`France`); left out when the club does not know it. */
  country?: string | null;
  /** The starting fare, formatted (`$3,450`); none — the card reads `Explore`. */
  fromPrice?: string | null;
  /** The saving in whole percent, only where the published fare is on record. */
  savePercent?: number | null;
  /** The offer's own picture, else its city's photo (ADR-IMPL-043); null — the fallback. */
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
  /** `Other great fares` (08): a smaller card — the photo, the city and the price only. */
  compact?: boolean;
};

/**
 * The offer card (02; sheet 40): a tall daylight photo, then the city in `title-sm`, the country in slate, `from` and the
 * price in `price`, and the `Save 54%` pill across the foot. White, radius 20, the card shadow. 124 pt wide.
 */
export function OfferCard({
  city,
  country,
  fromPrice,
  savePercent,
  image,
  fallback,
  onPress,
  testID,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={[city, fromPrice ? `from ${fromPrice}` : null].filter(Boolean).join(", ")}
        onPress={onPress}
        style={({ pressed }) => [styles.card, styles.compactCard, pressed && styles.pressed]}
      >
        <Photo source={image} fallback={fallback} style={styles.compactPhoto} />
        <View style={styles.compactBody}>
          <Text style={styles.compactCity} numberOfLines={1}>
            {city}
          </Text>
          {fromPrice ? (
            <Text style={styles.compactPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              <Text style={styles.from}>{"from "}</Text>
              {fromPrice}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[
        city,
        country,
        fromPrice ? `from ${fromPrice}` : null,
        savePercent ? `save ${savePercent}%` : null,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={image} fallback={fallback} style={styles.photo} />
      <View style={styles.body}>
        <Text style={styles.city} numberOfLines={1}>
          {city}
        </Text>
        {country ? (
          <Text style={styles.country} numberOfLines={1}>
            {country}
          </Text>
        ) : null}
        <View style={styles.priceBlock}>
          {fromPrice ? (
            <>
              <Text style={styles.from}>from</Text>
              <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit>
                {fromPrice}
              </Text>
            </>
          ) : (
            <Text style={styles.from}>Explore</Text>
          )}
        </View>
        {savePercent ? <SavePill percent={savePercent} fill /> : null}
      </View>
    </Pressable>
  );
}

type WideProps = Props & {
  /** `half`: two to a row (16, `To Europe`); `full`: the row's width (`To Asia`). */
  span: "half" | "full";
};

/** The offer card laid sideways (16): the photo at the left, the words and the pill at the right. */
export function OfferCardWide({
  city,
  country,
  fromPrice,
  savePercent,
  image,
  fallback,
  onPress,
  testID,
  span,
}: WideProps) {
  const full = span === "full";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[
        city,
        country,
        fromPrice ? `from ${fromPrice}` : null,
        savePercent ? `save ${savePercent}%` : null,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.wide, full ? styles.wideFull : styles.wideHalf, pressed && styles.pressed]}
    >
      <Photo
        source={image}
        fallback={fallback}
        style={[styles.widePhoto, { width: (full ? "42%" : 52) as DimensionValue }]}
      />
      <View style={[styles.wideBody, full && styles.wideBodyFull]}>
        <View style={styles.wideText}>
          <Text style={styles.wideCity} numberOfLines={1}>
            {city}
          </Text>
          {country ? (
            <Text style={styles.wideCountry} numberOfLines={full ? 1 : 2}>
              {country}
            </Text>
          ) : null}
          {fromPrice ? (
            <>
              <Text style={styles.wideFrom}>from</Text>
              <Text style={styles.widePrice} numberOfLines={1}>
                {fromPrice}
              </Text>
            </>
          ) : (
            <Text style={styles.from}>Explore</Text>
          )}
        </View>
        {savePercent ? (
          <View style={full ? styles.widePillFull : undefined}>
            <SavePill percent={savePercent} fill={!full} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A row of offer cards that scrolls sideways and runs to the screen's edges (02): the first card 12 pt from the edge,
 * the cards 8 pt apart, the last one cut so the row reads as scrollable. `bleed` is the parent's gutter it reaches over.
 */
export function CarouselRow({
  children,
  testID,
  bleed = tokens.space.gutter,
}: {
  children: ReactNode;
  testID: string;
  bleed?: number;
}) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={styles.carouselContent}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 124,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.9 },
  photo: { height: 116, borderTopLeftRadius: tokens.radius.lg, borderTopRightRadius: tokens.radius.lg },
  // 08: three to the screen's width, the photo over the city and its price.
  compactCard: { borderRadius: tokens.radius.md },
  compactPhoto: { height: 80, borderTopLeftRadius: tokens.radius.md, borderTopRightRadius: tokens.radius.md },
  compactBody: { paddingHorizontal: 10, paddingVertical: tokens.space.xs },
  compactCity: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  compactPrice: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  body: { padding: 10, gap: 2 },
  city: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  country: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  priceBlock: { marginTop: tokens.space.xxs, marginBottom: 6 },
  from: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  price: { ...rn(tokens.type.price), color: tokens.colors.textPrimary },
  wide: {
    flexDirection: "row",
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    overflow: "hidden",
    ...tokens.elevation.card,
  },
  wideHalf: { flex: 1, minHeight: 104 },
  wideFull: { alignSelf: "stretch", minHeight: 84 },
  widePhoto: { alignSelf: "stretch" },
  wideBody: { flex: 1, padding: 10, gap: tokens.space.xs, justifyContent: "space-between" },
  wideBodyFull: { flexDirection: "row", alignItems: "flex-end" },
  wideText: { flex: 1, gap: 0, minWidth: 72 },
  wideCity: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  widePrice: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
  widePillFull: { minWidth: 100 },
  wideCountry: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  wideFrom: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, marginTop: tokens.space.xxs },
  carouselContent: { gap: tokens.space.xs, paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.sm },
});
