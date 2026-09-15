import { Pressable, StyleSheet, Text } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Props = {
  label: string;
  onPress: () => void;
  chevron?: boolean;
  danger?: boolean;
  testID?: string;
};

export function ListRow({ label, onPress, chevron = true, danger = false, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
      {chevron ? <ClubIcon name="chevron" size={18} color={Club.colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Club.space.md,
    borderBottomWidth: 1,
    borderBottomColor: Club.colors.borderDefault,
    backgroundColor: Club.colors.surfaceCard,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    ...Club.type.body,
    color: Club.colors.textPrimary,
  },
  danger: {
    color: Club.colors.statusDanger,
  },
});
