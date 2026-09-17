import { Pressable, StyleSheet, Text } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
  testID: string;
};

/** A filter pill. 36 pt tall, so it needs hitSlop to clear the 44-pt minimum target. */
export function Chip({ label, selected = false, icon, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={selected ? tokens.colors.textOnDark : tokens.colors.textSecondary} />
      ) : null}
      <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  selected: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  pressed: { opacity: 0.85 },
  label: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  selectedLabel: { color: tokens.colors.textOnDark },
});
