import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  city: string;
  /** The airport's name (`Heathrow Airport`) and its code, set apart by a dot. */
  airport: string;
  code: string;
  /** The starting fare, formatted (`$3,900`); none — no price is shown. */
  fromPrice?: string | null;
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
};

/**
 * 03, measured: the card 166 pt tall, radius 10, a hairline and the card shadow; the photograph 118 pt across the top;
 * under it the city's baseline 18.7 pt down and the airport's 16.6 pt lower, 13.4 pt from the left; `from` over the
 * price ending 34 pt from the right edge; the chevron 15 pt in, in the middle of the words.
 */
const CARD = { radius: 10, photo: 118, padLeft: 13.4, priceRight: 34, chevronRight: 6, chevron: 18 } as const;
const CITY_BASELINE = 18.7;
const LINE_PITCH = 16.6;
const TEXT_AREA = 47.7;
const DOT = { size: 2.3, gap: 8.5 } as const;

export function PopularCard({ city, airport, code, fromPrice, image, fallback, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[city, `${airport}, ${code}`, fromPrice ? `from ${fromPrice}` : null]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={image} fallback={fallback} style={styles.photo} />
      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={styles.city} numberOfLines={1}>
            {city}
          </Text>
          <View style={styles.airportRow}>
            <Text style={styles.airport} numberOfLines={1}>
              {airport}
            </Text>
            <View style={styles.dot} />
            <Text style={styles.airport}>{code}</Text>
          </View>
        </View>
        {fromPrice ? (
          <View style={styles.price}>
            <Text style={styles.from}>from</Text>
            <Text style={styles.amount} numberOfLines={1}>
              {fromPrice}
            </Text>
          </View>
        ) : null}
        <View style={styles.chevron}>
          <Icon name="chevron" size={CARD.chevron} color={tokens.colors.textSecondary} strokeWidth={1.75} />
        </View>
      </View>
    </Pressable>
  );
}

const city = tokens.type.subtitle;
const meta = tokens.type.cardMeta;
const from = tokens.type.caption;
const amount = tokens.type.priceSm;

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: CARD.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderDefault,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.85 },
  photo: { height: CARD.photo, borderTopLeftRadius: CARD.radius, borderTopRightRadius: CARD.radius },
  body: { flexDirection: "row", alignItems: "stretch", minHeight: TEXT_AREA, paddingLeft: CARD.padLeft },
  text: { flex: 1, paddingTop: CITY_BASELINE - baselineOffset(city) },
  city: { ...rn(city), color: tokens.colors.textPrimary },
  airportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DOT.gap,
    marginTop: LINE_PITCH - belowBaseline(city) - baselineOffset(meta),
  },
  airport: { ...rn(meta), color: tokens.colors.textSecondary, flexShrink: 1 },
  dot: { width: DOT.size, height: DOT.size, borderRadius: DOT.size, backgroundColor: tokens.colors.textSecondary },
  price: { alignItems: "flex-end", paddingTop: CITY_BASELINE - baselineOffset(from) },
  from: { ...rn(from), color: tokens.colors.textSecondary },
  amount: {
    ...rn(amount),
    color: tokens.colors.textPrimary,
    marginTop: LINE_PITCH - belowBaseline(from) - baselineOffset(amount),
  },
  chevron: {
    justifyContent: "center",
    marginLeft: CARD.priceRight - CARD.chevronRight - CARD.chevron,
    marginRight: CARD.chevronRight,
  },
});
