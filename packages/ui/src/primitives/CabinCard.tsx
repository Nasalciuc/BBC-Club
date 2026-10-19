import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  /** Its line in slate, wrapping within the card (`More space, a better journey`). */
  line: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * A cabin to choose (01; sheet 39): the seat, the cabin in `body-strong` over its line, a check circle. Chosen: a navy border
 * on light tint and a filled navy check; the other white on its hairline, its circle empty. Two side by side.
 */
export function CabinCard({ title, line, icon, selected, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${title}, ${line}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <Icon
        name={icon}
        size={24}
        color={selected ? tokens.colors.textPrimary : tokens.colors.textSecondary}
        strokeWidth={1.5}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.line} numberOfLines={3}>
          {line}
        </Text>
      </View>
      {selected ? (
        <View style={styles.check}>
          <Icon name="check" size={12} color={tokens.colors.textOnPhoto} strokeWidth={3} />
        </View>
      ) : (
        <View style={styles.circle} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  selected: { borderColor: tokens.colors.primary, borderWidth: 1.5, backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.85 },
  text: { flex: 1, gap: 2 },
  title: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textPrimary },
  line: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  check: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.actionPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.colors.textSecondary,
  },
});
