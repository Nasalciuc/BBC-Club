import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
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

/**
 * 03, measured: a white row 47 pt tall, radius 9; the photograph 47.4 × 42 pt, 3.4 pt in, radius 6; the city's baseline
 * 18 pt down, 11.9 pt right of the photograph, the dates' 15.7 pt under it; a 16-pt chevron 13.4 pt from the right.
 */
const ROW = { height: 47, radius: 9, inset: 3.4, thumbW: 47.4, thumbH: 42, thumbRadius: 6, textGap: 11.9 } as const;
const CITY_BASELINE = 18;
const LINE_PITCH = 15.7;
const CHEVRON = { size: 16, right: 5.4 } as const;

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
      <Icon name="chevron" size={CHEVRON.size} color={tokens.colors.textSecondary} strokeWidth={1.75} />
    </Pressable>
  );
}

const city = tokens.type.rowTitle;
const detail = tokens.type.caption;

const styles = StyleSheet.create({
  row: {
    minHeight: ROW.height,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: ROW.inset,
    paddingRight: CHEVRON.right,
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: ROW.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderDefault,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: ROW.thumbW, height: ROW.thumbH, borderRadius: ROW.thumbRadius },
  text: { flex: 1, alignSelf: "flex-start", marginLeft: ROW.textGap, paddingTop: CITY_BASELINE - baselineOffset(city) },
  city: { ...rn(city), color: tokens.colors.textPrimary },
  detail: {
    ...rn(detail),
    color: tokens.colors.textSecondary,
    marginTop: LINE_PITCH - belowBaseline(city) - baselineOffset(detail),
  },
});
