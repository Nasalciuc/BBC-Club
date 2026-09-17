import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { flagSource } from "../assets/flags";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  code: string;
  city: string;
  airport: string;
  countryCode: string;
  onPress: () => void;
  testID: string;
};

/** Flag is an Image, never an emoji — emoji flags blank on several Android builds. */
export function AirportRow({ code, city, airport, countryCode, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${city}, ${airport}, ${code}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.pill}>
        <Icon name="plane" size={14} />
        <Text style={styles.code}>{code}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.city} numberOfLines={1}>
          {city}
        </Text>
        <Text style={styles.airport} numberOfLines={1}>
          {airport}
        </Text>
      </View>
      <Image source={flagSource(countryCode)} style={styles.flag} accessibilityIgnoresInvertColors />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  pressed: { opacity: 0.85 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xxs,
    borderWidth: 1,
    borderColor: tokens.colors.textTertiary,
    borderRadius: tokens.radius.badge,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xxs,
  },
  code: { ...rn(tokens.type.factsMono), color: tokens.colors.textPrimary },
  text: { flex: 1, gap: tokens.space.xxs },
  city: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  airport: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  flag: { width: 20, height: 14, borderRadius: 2 },
});
