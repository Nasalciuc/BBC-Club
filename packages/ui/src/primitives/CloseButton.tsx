import { Pressable, StyleSheet, View } from "react-native";
import { icons } from "../icons";
import { tokens } from "../tokens";

/** Figma's × spans 14 pt of the 32-pt circle (299:200): lucide's `x` drawn on a 28-pt box, its 1.5 stroke to scale. */
const Cross = icons.clear;

type Props = {
  onPress: () => void;
  testID: string;
};

/** Figma CloseButton (299:200): 44 × 44 target; a 32-pt circle filled `border-default`, the ×. Never the word Close. */
export function CloseButton({ onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <View style={styles.circle}>
        <Cross size={28} color={tokens.colors.textPrimary} strokeWidth={1.5} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
