import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  onPress: () => void;
  testID: string;
  /** `See all ›`. */
  chevron?: boolean;
  /** `primary` navy (`Cancel`, `Clear all`, `See all`), `secondary` slate (`Skip`, `Not now`). */
  tone?: "primary" | "secondary";
  /** `button` 17 Semibold for `Skip` and `Not now` under a pill; `body` 16 for the header actions. */
  size?: "body" | "button";
  disabled?: boolean;
};

/** The text buttons of sheet 38: the words alone, in a 44-pt target. */
export function TextButton({
  label,
  onPress,
  testID,
  chevron = false,
  tone = "primary",
  size = "body",
  disabled = false,
}: Props) {
  const color = tone === "primary" ? tokens.colors.textPrimary : tokens.colors.textSecondary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, (pressed || disabled) && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={[size === "button" ? styles.button : styles.body, { color }]}>{label}</Text>
        {chevron ? <Icon name="chevron" size={18} color={color} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.xxs },
  body: { ...rn(tokens.type.body) },
  button: { ...rn(tokens.type.button) },
  pressed: { opacity: 0.55 },
});
