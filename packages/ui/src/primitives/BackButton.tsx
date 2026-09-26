import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  style?: ViewStyle;
};

/** 44 × 44 hit; left chevron 24. Label is the symbol — never the word Back. */
export function BackButton({ onPress, testID, style }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, style, pressed && styles.pressed]}
    >
      <Icon name="back" size={24} color={tokens.colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
});
