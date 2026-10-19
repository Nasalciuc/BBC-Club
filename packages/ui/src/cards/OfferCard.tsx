import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
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
  /** `4.8`, as whoever made the offer gave it (ADR-IMPL-056); none — no star. */
  rating?: string | null;
  /** The offer's own picture, else its city's photo (ADR-IMPL-043, ADR-IMPL-056); null — the fallback. */
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
  /** `rest`: Explore's row (02); `sheet`: the raised sheet's row (16), a shorter card. */
  look?: "rest" | "sheet";
  /** `Other great fares` (08): a smaller card — the photo, the city and the price only. */
  compact?: boolean;
};

type TypeRole = TextStyle & { fontSize: number; lineHeight: number };

/**
 * A card's words as its screen measures them, in points from the card's top-left: where the words start, each line's
 * baseline, the rating's baseline and its right inset, the star's size and where its box stands over that baseline,
 * and the pill's frame.
 */
type CardLook = {
  width: number;
  height: number;
  radius: number;
  photo: number;
  textLeft: number;
  city: { role: TypeRole; baseline: number };
  country: { role: TypeRole; baseline: number };
  from: { role: TypeRole; baseline: number };
  price: { role: TypeRole; baseline: number };
  rating: { role: TypeRole; baseline: number; right: number; star: number; starTop: number; gap: number };
  pill: { top: number; height: number; left: number; right: number; role: TypeRole };
};

const r = (t: (typeof tokens.type)[keyof typeof tokens.type]) => rn(t) as TypeRole;

/**
 * 02, measured: 121.3 × 265, radius 12, the photo 144.7 tall; the words 11 in — the city's baseline 166.8, the
 * country's 182.8, `from` 200.6, the price 218.4; `★ 4.8` 8.9 from the right on 168.6; the pill 229.3–256.1, 11.1 in and
 * 8.7 from the right. 16: 121.4 × 222.4, radius 10.5, the photo 124.1; the words 11.4 in on 143.5, 157.1, 170.8,
 * 186.4; the rating on 144.5; the pill 193.5–215.6.
 */
const LOOKS: Record<"rest" | "sheet", CardLook> = {
  rest: {
    width: 121.3,
    height: 265,
    radius: 12,
    photo: 144.7,
    textLeft: 11,
    city: { role: r(tokens.type.offerCity), baseline: 166.8 },
    country: { role: r(tokens.type.offerCountry), baseline: 182.8 },
    from: { role: r(tokens.type.offerFrom), baseline: 200.6 },
    price: { role: r(tokens.type.offerPrice), baseline: 218.4 },
    rating: { role: r(tokens.type.offerRating), baseline: 168.6, right: 8.9, star: 12.56, starTop: -10.45, gap: 1.75 },
    pill: { top: 229.3, height: 26.8, left: 11.1, right: 8.7, role: r(tokens.type.offerSave) },
  },
  sheet: {
    width: 121.4,
    height: 222.4,
    radius: 10.5,
    photo: 124.1,
    textLeft: 11.4,
    city: { role: r(tokens.type.offerSmCity), baseline: 143.5 },
    country: { role: r(tokens.type.offerSmCountry), baseline: 157.1 },
    from: { role: r(tokens.type.offerSmFrom), baseline: 170.8 },
    price: { role: r(tokens.type.offerSmPrice), baseline: 186.4 },
    rating: { role: r(tokens.type.offerSmRating), baseline: 144.5, right: 8.2, star: 11.58, starTop: -9.68, gap: 1.66 },
    pill: { top: 193.5, height: 22.1, left: 11.4, right: 8.4, role: r(tokens.type.offerSmSave) },
  },
};
/**
 * 08's `Other great fares`, measured: 114.2 × 117.2, radius 8.1, on a hairline over a light shadow; the photo across
 * the top, 77.6 tall; the words 11.55 in — the city's baseline 92, the price's 108.7, `from` before it in slate
 * (DESIGN.md: a starting fare says so; 08 draws the price alone).
 */
const COMPACT = {
  width: 114.2,
  height: 117.2,
  radius: 8.1,
  photo: 77.6,
  textLeft: 11.55,
  city: { role: r(tokens.type.offerCitySm), baseline: 92.0 },
  price: { role: r(tokens.type.offerPriceSm), baseline: 108.74 },
  from: r(tokens.type.offerFromSm),
} as const;

/** What the city leaves at its right for `★ 4.8`. */
const RATING_ROOM = 30;

/** The margin that puts a line's baseline `pitch` under the one before it (or the top of what comes first). */
const after = (pitch: number, prev: TypeRole | null, next: TypeRole) =>
  pitch - (prev ? belowBaseline(prev) : 0) - baselineOffset(next);

/** `★ 4.8`: the filled star, then the rating in navy. */
function Rating({ value, look }: { value: string; look: CardLook["rating"] }) {
  return (
    <View style={styles.ratingRow}>
      <View style={{ marginTop: baselineOffset(look.role) + look.starTop, marginRight: look.gap }}>
        <Icon name="star-fill" size={look.star} color={tokens.colors.textPrimary} />
      </View>
      <Text style={[look.role, styles.rating]}>{value}</Text>
    </View>
  );
}

/** The `Save 54%` bar across a card's foot (02, 16), in navy on the soft save tint. */
function SaveBar({ percent, height, role }: { percent: number; height: number; role: TypeRole }) {
  return (
    <View style={[styles.save, { height, borderRadius: height / 2 }]}>
      <Text style={[role, styles.saveText]} numberOfLines={1}>{`Save ${percent}%`}</Text>
    </View>
  );
}

/**
 * The offer card (02, 16; sheet 40): a tall daylight photo, then the city with its rating at the right, the country in
 * slate, `from` and the price, and the `Save 54%` pill across the foot. White with the card shadow.
 */
export function OfferCard({
  city,
  country,
  fromPrice,
  savePercent,
  rating,
  image,
  fallback,
  onPress,
  testID,
  look = "rest",
  compact = false,
}: Props) {
  const label = [
    city,
    rating ? `rated ${rating}` : null,
    country,
    fromPrice ? `from ${fromPrice}` : null,
    savePercent ? `save ${savePercent}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (compact) {
    const c = COMPACT;
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={[city, fromPrice ? `from ${fromPrice}` : null].filter(Boolean).join(", ")}
        onPress={onPress}
        style={({ pressed }) => [
          styles.compactCard,
          { width: c.width, minHeight: c.height, borderRadius: c.radius },
          pressed && styles.pressed,
        ]}
      >
        <Photo
          source={image}
          fallback={fallback}
          style={{ height: c.photo, borderTopLeftRadius: c.radius, borderTopRightRadius: c.radius }}
        />
        <View style={{ paddingLeft: c.textLeft, paddingRight: 8 }}>
          <Text
            style={[c.city.role, styles.navy, { marginTop: c.city.baseline - c.photo - baselineOffset(c.city.role) }]}
            numberOfLines={1}
          >
            {city}
          </Text>
          {fromPrice ? (
            <Text
              style={[
                c.price.role,
                styles.navy,
                { marginTop: after(c.price.baseline - c.city.baseline, c.city.role, c.price.role) },
              ]}
              numberOfLines={1}
            >
              <Text style={[c.from, styles.slate]}>{"from "}</Text>
              {fromPrice}
            </Text>
          ) : null}
        </View>
        <View pointerEvents="none" style={[styles.compactEdge, { borderRadius: c.radius }]} />
      </Pressable>
    );
  }
  const g = LOOKS[look];
  const priceLines = fromPrice ? (
    <>
      <Text
        style={[
          g.from.role,
          styles.slate,
          { marginTop: after(g.from.baseline - g.country.baseline, g.country.role, g.from.role) },
        ]}
      >
        from
      </Text>
      <Text
        style={[
          g.price.role,
          styles.navy,
          { marginTop: after(g.price.baseline - g.from.baseline, g.from.role, g.price.role) },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {fromPrice}
      </Text>
    </>
  ) : (
    <Text
      style={[
        g.from.role,
        styles.slate,
        { marginTop: after(g.from.baseline - g.country.baseline, g.country.role, g.from.role) },
      ]}
    >
      Explore
    </Text>
  );
  const lastBaseline = fromPrice ? g.price.baseline : g.from.baseline;
  const lastRole = fromPrice ? g.price.role : g.from.role;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: g.width, minHeight: g.height, borderRadius: g.radius },
        pressed && styles.pressed,
      ]}
    >
      <Photo
        source={image}
        fallback={fallback}
        style={{ height: g.photo, borderTopLeftRadius: g.radius, borderTopRightRadius: g.radius }}
      />
      <View style={{ paddingLeft: g.textLeft, paddingRight: g.rating.right }}>
        <Text
          style={[
            g.city.role,
            styles.navy,
            { marginTop: after(g.city.baseline - g.photo, null, g.city.role), marginRight: rating ? RATING_ROOM : 0 },
          ]}
          numberOfLines={1}
        >
          {city}
        </Text>
        {rating ? (
          <View
            style={[
              styles.ratingAt,
              { right: g.rating.right, top: g.rating.baseline - g.photo - baselineOffset(g.rating.role) },
            ]}
          >
            <Rating value={rating} look={g.rating} />
          </View>
        ) : null}
        <Text
          style={[
            g.country.role,
            styles.slate,
            { marginTop: after(g.country.baseline - g.city.baseline, g.city.role, g.country.role) },
          ]}
          numberOfLines={1}
        >
          {country ?? " "}
        </Text>
        {priceLines}
      </View>
      {savePercent ? (
        <View
          style={{
            marginTop: g.pill.top - (lastBaseline + belowBaseline(lastRole)),
            marginLeft: g.pill.left,
            marginRight: g.pill.right,
            marginBottom: g.height - g.pill.top - g.pill.height,
          }}
        >
          <SaveBar percent={savePercent} height={g.pill.height} role={g.pill.role} />
        </View>
      ) : null}
    </Pressable>
  );
}

type WideProps = Omit<Props, "look" | "compact"> & {
  /** `half`: two to a row (16, `To Europe`); `full`: the row's width (`To Asia`). */
  span: "half" | "full";
};

/**
 * 16, measured (card top T, left L). Two to a row: 96.7 tall, radius 10, the photo 80.9 wide; the words 10.7 after it —
 * the city's baseline T+17.8, the country's 32.6, `from` 47.5, the price 63.4; `★ 4.8` 6.8 from the right on T+19.4;
 * the pill from the words' column (less 1.1) to 5.7 from the right, 70.5–91.3. One across: 74.8 tall, the photo 154.3;
 * the words 12.5 after it on 17.6, 31.8, 48.9, 64.7; the star at L+218.3 on 20.9; the pill 89.9 × 22.6 at the right,
 * 7.2 from it and 6.6 from the foot.
 */
const WIDE = {
  half: {
    height: 96.7,
    photo: 80.9,
    gap: 10.7,
    city: 17.8,
    country: 32.6,
    from: 47.5,
    price: 63.4,
    rating: { baseline: 19.4, right: 6.8, star: 11.2, starTop: -9.44, gap: 1.62 },
    pill: { top: 70.5, height: 20.8, left: -1.1, right: 5.7 },
  },
  full: {
    height: 74.8,
    photo: 154.3,
    gap: 12.5,
    city: 17.6,
    country: 31.8,
    from: 48.9,
    price: 64.7,
    rating: { baseline: 20.9, left: 218.3, star: 11.6, starTop: -9.83, gap: 1.65 },
    pill: { width: 89.9, height: 22.6, right: 7.2, bottom: 6.6 },
  },
} as const;
const wideRoles = {
  city: r(tokens.type.wideCity),
  country: r(tokens.type.wideCountry),
  from: r(tokens.type.wideFrom),
  price: r(tokens.type.widePrice),
  rating: r(tokens.type.offerSmRating),
  save: r(tokens.type.wideSave),
  saveLg: r(tokens.type.wideSaveLg),
};

/** The offer card laid sideways (16): the photo at the left, the words and the pill at the right. */
export function OfferCardWide({
  city,
  country,
  fromPrice,
  savePercent,
  rating,
  image,
  fallback,
  onPress,
  testID,
  span,
}: WideProps) {
  const R = wideRoles;
  const g = span === "half" ? WIDE.half : WIDE.full;
  const label = [
    city,
    rating ? `rated ${rating}` : null,
    country,
    fromPrice ? `from ${fromPrice}` : null,
    savePercent ? `save ${savePercent}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const ratingLook = {
    role: R.rating,
    baseline: g.rating.baseline,
    right: 0,
    star: g.rating.star,
    starTop: g.rating.starTop,
    gap: g.rating.gap,
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wide,
        span === "half" ? styles.wideHalf : styles.wideFull,
        { minHeight: g.height },
        pressed && styles.pressed,
      ]}
    >
      <Photo source={image} fallback={fallback} style={[styles.widePhoto, { width: g.photo }]} />
      <View style={[styles.wideBody, { paddingLeft: g.gap }]}>
        <Text
          style={[
            R.city,
            styles.navy,
            { marginTop: after(g.city, null, R.city), marginRight: span === "half" ? RATING_ROOM : 0 },
          ]}
          numberOfLines={1}
        >
          {city}
        </Text>
        <Text
          style={[R.country, styles.slate, { marginTop: after(g.country - g.city, R.city, R.country) }]}
          numberOfLines={1}
        >
          {country ?? " "}
        </Text>
        {fromPrice ? (
          <>
            <Text style={[R.from, styles.slate, { marginTop: after(g.from - g.country, R.country, R.from) }]}>
              from
            </Text>
            <Text
              style={[R.price, styles.navy, { marginTop: after(g.price - g.from, R.from, R.price) }]}
              numberOfLines={1}
            >
              {fromPrice}
            </Text>
          </>
        ) : (
          <Text style={[R.from, styles.slate, { marginTop: after(g.from - g.country, R.country, R.from) }]}>
            Explore
          </Text>
        )}
        {savePercent && span === "half" ? (
          <View
            style={{
              marginTop: WIDE.half.pill.top - (WIDE.half.price + belowBaseline(R.price)),
              marginLeft: WIDE.half.pill.left,
              marginRight: WIDE.half.pill.right,
              marginBottom: WIDE.half.height - WIDE.half.pill.top - WIDE.half.pill.height,
            }}
          >
            <SaveBar percent={savePercent} height={WIDE.half.pill.height} role={R.save} />
          </View>
        ) : (
          <View style={{ height: g.height - g.price - belowBaseline(R.price) }} />
        )}
      </View>
      {rating ? (
        <View
          style={[
            styles.ratingAt,
            span === "half" ? { right: WIDE.half.rating.right } : { left: WIDE.full.rating.left },
            { top: g.rating.baseline - baselineOffset(R.rating) },
          ]}
        >
          <Rating value={rating} look={ratingLook} />
        </View>
      ) : null}
      {savePercent && span === "full" ? (
        <View style={styles.wideFullPill}>
          <SaveBar percent={savePercent} height={WIDE.full.pill.height} role={R.saveLg} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A row of offer cards that scrolls sideways and runs to the screen's edges (02, 16): the first card `inset` from the
 * screen's edge (02: 11), the cards 8 apart, the last one cut so the row reads as scrollable. `bleed` is the parent's
 * gutter it reaches over; the row keeps 12 pt above and below for the cards' shadow.
 */
export function CarouselRow({
  children,
  testID,
  bleed = tokens.space.gutter,
  inset = tokens.space.sm,
  gap,
}: {
  children: ReactNode;
  testID: string;
  bleed?: number;
  inset?: number;
  /** The space between the cards as the screen draws it (08: 8.55); 8 by default. */
  gap?: number;
}) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.carouselContent, { paddingHorizontal: inset }, gap != null && { gap }]}
    >
      {children}
    </ScrollView>
  );
}

/** The room the row keeps above and below its cards for their shadow. */
export const CAROUSEL_PAD = tokens.space.sm;

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.card },
  pressed: { opacity: 0.9 },
  navy: { color: tokens.colors.textPrimary },
  slate: { color: tokens.colors.textSecondary },
  ratingAt: { position: "absolute" },
  ratingRow: { flexDirection: "row", alignItems: "flex-start" },
  rating: { color: tokens.colors.textPrimary },
  save: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.surfaceSaveSoft,
  },
  saveText: { color: tokens.colors.textPrimary },
  // 08: the white card on its hairline over a light shadow.
  compactCard: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.lift },
  compactEdge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
  },
  wide: {
    flexDirection: "row",
    borderRadius: 10,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  wideHalf: { flex: 1 },
  wideFull: { flex: 1 },
  widePhoto: { alignSelf: "stretch", borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  wideBody: { flex: 1 },
  wideFullPill: {
    position: "absolute",
    right: WIDE.full.pill.right,
    bottom: WIDE.full.pill.bottom,
    width: WIDE.full.pill.width,
  },
  carouselContent: { gap: tokens.space.xs, paddingVertical: CAROUSEL_PAD },
});
