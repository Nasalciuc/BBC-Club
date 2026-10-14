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
  /**
   * Prefer `trailing`; `chevron` kept so existing screens compile unchanged. `external`: Figma's `↗` in the value's
   * place (479:8279) — the row opens a page outside the app.
   */
  trailing?: "chevron" | "none" | "external";
  chevron?: boolean;
  danger?: boolean;
  /** Figma Type=Disabled: the row at 40%, not tappable. */
  disabled?: boolean;
  /**
   * Figma Type=Switch on / off: a 48 × 28 switch in a 48 × 44 target, no chevron. Without `onChange` it only shows
   * its value. `locked`: a switch the member cannot change (238:5502, `Request updates`, always on) — the label and the
   * switch at 40% on the white card.
   */
  toggle?: { value: boolean; onChange?: (next: boolean) => void; testID?: string; locked?: boolean };
  /** `sm` is 56 pt — the fare page's `Why it's $X lower` (135:845). Otherwise 64. */
  size?: "md" | "sm";
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
  size = "md",
  testID,
}: Props) {
  const pressable = onPress != null && !disabled;
  const frame = [styles.row, size === "sm" && styles.sm];
  const showChevron = toggle == null && (trailing != null ? trailing === "chevron" : onPress != null && chevron);
  const a11yLabel = value ? `${label}, ${value}` : label;
  // Figma's `↗` row (479:8279) opens a page outside the app: a link to a screen reader, a button otherwise.
  const role = trailing === "external" ? "link" : "button";

  const body = (
    <>
      {icon ? <Icon name={icon} size={20} color={tokens.colors.textSecondary} /> : null}
      <Text style={[styles.label, danger && styles.danger, toggle?.locked && styles.locked]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Icon name="chevron" size={20} color={tokens.colors.textSecondary} /> : null}
      {trailing === "external" ? (
        <Text style={styles.value} accessibilityElementsHidden importantForAccessibility="no">
          ↗
        </Text>
      ) : null}
      {toggle ? <Switch {...toggle} label={label} disabled={disabled} /> : null}
    </>
  );

  if (!pressable) {
    // A row that would act and cannot now (`disabled` with an `onPress`) stays one element to VoiceOver and TalkBack —
    // a button, dimmed — so the 40% is not the only sign (DESIGN.md: nothing communicated by color alone). A row with a
    // switch leaves the reading to its switch, which says the same.
    const dimmedAction = onPress != null && toggle == null;
    return (
      <View
        testID={testID}
        style={[...frame, disabled && styles.disabled]}
        accessible={dimmedAction}
        accessibilityRole={dimmedAction ? role : undefined}
        accessibilityState={dimmedAction ? { disabled: true } : undefined}
        accessibilityLabel={a11yLabel}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [...frame, pressed && styles.pressed]}
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
  locked = false,
}: {
  value: boolean;
  onChange?: (next: boolean) => void;
  testID?: string;
  label: string;
  disabled: boolean;
  locked?: boolean;
}) {
  const fixed = disabled || locked || onChange == null;
  // 238:5502 draws a locked switch's target, track and thumb each at 40%: the track reads as a light grey, the thumb
  // lighter still.
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: fixed }}
      disabled={fixed}
      onPress={() => onChange?.(!value)}
      style={[styles.switchTarget, locked && styles.locked]}
    >
      <View style={[styles.switch, value ? styles.switchOn : styles.switchOff, locked && styles.locked]}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff, locked && styles.locked]} />
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
  sm: { minHeight: 56 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  locked: { opacity: 0.4 },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  value: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, flexShrink: 1, maxWidth: "50%" },
  danger: { color: tokens.colors.statusDanger },
  // The 44-pt target reaches 2 pt into the row's padding: a row with a switch stays Figma's 64 pt (238:5502).
  switchTarget: { width: 48, height: 44, marginVertical: -2, alignItems: "center", justifyContent: "center" },
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
