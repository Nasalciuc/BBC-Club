import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  code: string;
  city: string;
  airport: string;
  /** `selected`: the chosen airport (a navy border and a check); `recent`: one searched before (a clock). */
  state?: "default" | "selected" | "recent";
  /**
   * `detail` (18, Search): the city over `Heathrow Airport · LHR`, a chevron. `code` (14, onboarding): the city alone,
   * the code in slate at the right.
   */
  layout?: "detail" | "code";
  onPress: () => void;
  testID: string;
};

/** An airport to choose (14, 18): a white card with the map pin, the city, the airport and its code. */
export function AirportRow({ code, city, airport, state = "default", layout = "detail", onPress, testID }: Props) {
  const selected = state === "selected";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${city}, ${airport}, ${code}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        layout === "code" && styles.codeRow,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={state === "recent" ? "clock" : "map-pin"}
        size={24}
        color={tokens.colors.textPrimary}
        strokeWidth={1.75}
      />
      <View style={styles.text}>
        <Text style={styles.city} numberOfLines={1}>
          {city}
        </Text>
        {layout === "detail" ? (
          <Text style={styles.airport} numberOfLines={1}>
            {`${airport}  ·  ${code}`}
          </Text>
        ) : null}
      </View>
      {layout === "code" ? <Text style={styles.code}>{code}</Text> : null}
      {selected ? (
        <Icon name="check" size={20} color={tokens.colors.textPrimary} strokeWidth={2.25} />
      ) : layout === "detail" ? (
        <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  codeRow: { minHeight: 56, paddingHorizontal: tokens.space.gutter, gap: tokens.space.gutter },
  selected: { borderWidth: 1.5, borderColor: tokens.colors.primary },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 2 },
  city: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  airport: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  code: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textSecondary },
});
