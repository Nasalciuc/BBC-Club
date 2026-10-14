import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  style?: ViewStyle;
};

/** Figma BackButton (299:197): 44 × 44 target, the 24-pt chevron 6 pt in from its left edge. Never the word Back. */
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
  hit: { width: 44, height: 44, justifyContent: "center", paddingLeft: 6 },
  pressed: { opacity: 0.7 },
});
