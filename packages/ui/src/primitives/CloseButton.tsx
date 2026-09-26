import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
};

/** 44 × 44 hit; 32 circle, × 16. Label is the symbol — never the word Close. */
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
        <Icon name="clear" size={16} color={tokens.colors.textPrimary} />
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
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
