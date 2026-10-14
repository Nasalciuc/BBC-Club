import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  onPress?: () => void;
  /** Figma Type=Navigation: the current value at the right, before the chevron (`JFK · New York`). */
  value?: string;
  icon?: IconName;
  /** Prefer `trailing`; `chevron` kept so existing screens compile unchanged. */
  trailing?: "chevron" | "none";
  chevron?: boolean;
  danger?: boolean;
  /** Figma Type=Disabled: the row at 40%, not tappable. */
  disabled?: boolean;
  /** Figma Type=Switch on / off: a 48 × 28 switch in a 48 × 44 target, no chevron. */
  toggle?: { value: boolean; onChange: (next: boolean) => void; testID?: string };
  testID?: string;
};

/**
 * Figma ListRow (37:72): a white card, 64 pt, the field's 12-pt radius — the label, its value at the right, a 20-pt
 * chevron in `text-secondary`. Rows stand 8 pt apart; the parent spaces them.
 */
export function ListRow({
  label,
  onPress,
  value,
  icon,
  trailing,
  chevron = true,
  danger = false,
  disabled = false,
  toggle,
  testID,
}: Props) {
  const pressable = onPress != null && !disabled;
  const showChevron = toggle == null && (trailing != null ? trailing === "chevron" : onPress != null && chevron);
  const a11yLabel = value ? `${label}, ${value}` : label;

  const body = (
    <>
      {icon ? <Icon name={icon} size={20} color={tokens.colors.textSecondary} /> : null}
      <Text style={[styles.label, danger && styles.danger]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Icon name="chevron" size={20} color={tokens.colors.textSecondary} /> : null}
      {toggle ? <Switch {...toggle} label={label} disabled={disabled} /> : null}
    </>
  );

  if (!pressable) {
    return (
      <View testID={testID} style={[styles.row, disabled && styles.disabled]} accessibilityLabel={a11yLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function Switch({
  value,
  onChange,
  testID,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.switchTarget}
    >
      <View style={[styles.switch, value ? styles.switchOn : styles.switchOff]}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  value: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, flexShrink: 1, maxWidth: "50%" },
  danger: { color: tokens.colors.statusDanger },
  switchTarget: { width: 48, height: 44, alignItems: "center", justifyContent: "center" },
  switch: {
    width: 48,
    height: 28,
    borderRadius: tokens.radius.pill,
    padding: tokens.space.xxs,
    flexDirection: "row",
    alignItems: "center",
  },
  switchOn: { backgroundColor: tokens.colors.primary, justifyContent: "flex-end" },
  switchOff: { backgroundColor: tokens.colors.surfacePage, borderWidth: 1, borderColor: tokens.colors.textSecondary },
  thumb: { width: 20, height: 20, borderRadius: 10 },
  thumbOn: { backgroundColor: tokens.colors.surfaceCard },
  thumbOff: { backgroundColor: tokens.colors.textSecondary },
});
