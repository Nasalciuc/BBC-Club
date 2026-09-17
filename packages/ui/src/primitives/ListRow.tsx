import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  onPress: () => void;
  value?: string;
  icon?: IconName;
  /** Prefer `trailing`; `chevron` kept so existing screens compile unchanged. */
  trailing?: "chevron" | "none";
  chevron?: boolean;
  danger?: boolean;
  testID?: string;
};

export function ListRow({ label, onPress, value, icon, trailing, chevron = true, danger = false, testID }: Props) {
  const showChevron = trailing != null ? trailing === "chevron" : chevron;
  const compact = value != null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={20} color={tokens.colors.textSecondary} /> : null}
      <View style={styles.body}>
        <Text style={[styles.label, danger && styles.danger]} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {showChevron ? <Icon name="chevron" size={18} color={tokens.colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.sm,
    paddingVertical: tokens.space.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  compact: { minHeight: 56 },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: tokens.space.xxs },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  value: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  danger: { color: tokens.colors.statusDanger },
});
