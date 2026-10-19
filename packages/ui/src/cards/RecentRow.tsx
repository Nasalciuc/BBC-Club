import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  city: string;
  /** The dates searched (`Nov 12 – 19, 2026`), or the airport when none were chosen. */
  detail: string;
  image: PhotoSource | null;
  fallback: PhotoSource | null;
  onPress: () => void;
  testID: string;
};

/** Sheet 40 · 10, image 03: a recent search — the city's photograph small, the city over the dates, a chevron. */
export function RecentRow({ city, detail, image, fallback, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${city}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Photo source={image} fallback={fallback} style={styles.thumb} />
      <View style={styles.text}>
        <Text style={styles.city} numberOfLines={1}>
          {city}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    paddingVertical: tokens.space.xxs,
    paddingLeft: tokens.space.xxs,
    paddingRight: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.sm,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: 48, height: 44, borderRadius: tokens.radius.xs },
  text: { flex: 1, gap: 2 },
  city: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  detail: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
