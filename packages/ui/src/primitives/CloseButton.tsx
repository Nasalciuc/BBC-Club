import { Pressable, StyleSheet } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  /** `plain`: the × alone (a sheet's header, 06). `tint`: the × in a light tint circle (20). */
  tone?: "plain" | "tint";
};

/** A sheet's close (sheet 42): 44 × 44, the × in navy. Never the word Close. */
export function CloseButton({ onPress, testID, tone = "plain" }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, tone === "tint" && styles.tint, pressed && styles.pressed]}
    >
      <Icon name="x" size={24} color={tokens.colors.textPrimary} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center" },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.7 },
});
