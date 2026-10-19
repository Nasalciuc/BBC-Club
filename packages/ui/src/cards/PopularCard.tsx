import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  city: string;
  /** `Heathrow Airport · LHR`. */
  airport: string;
  /** The starting fare, formatted (`$3,900`); none — no price is shown. */
  fromPrice?: string | null;
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
};

/**
 * Sheet 40 · 03, image 03: a destination as a white card — the city's photograph across the top, then the city over its
 * airport at the left, `from` and the price at the right, and a chevron.
 */
export function PopularCard({ city, airport, fromPrice, image, fallback, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[city, airport, fromPrice ? `from ${fromPrice}` : null].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={image} fallback={fallback} style={styles.photo} />
      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={styles.city} numberOfLines={1}>
            {city}
          </Text>
          <Text style={styles.airport} numberOfLines={1}>
            {airport}
          </Text>
        </View>
        {fromPrice ? (
          <View style={styles.price}>
            <Text style={styles.from}>from</Text>
            <Text style={styles.amount} numberOfLines={1}>
              {fromPrice}
            </Text>
          </View>
        ) : null}
        <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surfaceCard, borderRadius: tokens.radius.md, ...tokens.elevation.card },
  pressed: { opacity: 0.85 },
  photo: { height: 118, borderTopLeftRadius: tokens.radius.md, borderTopRightRadius: tokens.radius.md },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    paddingLeft: tokens.space.md,
    paddingRight: tokens.space.sm,
  },
  text: { flex: 1, gap: 2 },
  city: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  airport: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  price: { alignItems: "flex-end" },
  from: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  amount: { ...rn(tokens.type.priceSm), color: tokens.colors.textPrimary },
});
