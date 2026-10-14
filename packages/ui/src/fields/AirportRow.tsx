import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  code: string;
  city: string;
  airport: string;
  /** Figma 28:65: `selected` is the chosen airport (border and check); `recent` one the member searched before (clock). */
  state?: "default" | "selected" | "recent";
  onPress: () => void;
  testID: string;
};

/**
 * Figma AirportRow (28:65): a white row, 72 pt — the city leads, the airport's name under it, the IATA code aligned at
 * the right in mono. Rows stand 8 pt apart; the parent spaces them.
 */
export function AirportRow({ code, city, airport, state = "default", onPress, testID }: Props) {
  const selected = state === "selected";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${city}, ${airport}, ${code}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.city} numberOfLines={1}>
          {city}
        </Text>
        <Text style={styles.airport} numberOfLines={1}>
          {airport}
        </Text>
      </View>
      <Text style={styles.code}>{code}</Text>
      {selected ? <Icon name="check" size={20} color={tokens.colors.textPrimary} /> : null}
      {state === "recent" ? <Icon name="clock" size={20} color={tokens.colors.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
  },
  selected: { backgroundColor: tokens.colors.surfacePage, borderWidth: 1, borderColor: tokens.colors.primary },
  pressed: { opacity: 0.85 },
  text: { flex: 1, gap: tokens.space.xxs },
  city: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  airport: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  code: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
});
