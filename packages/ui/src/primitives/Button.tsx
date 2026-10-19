import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

/**
 * The 3.0 pills (component sheet 38). `primary`: navy, one per screen. `outline`: white on a light-navy hairline
 * (`Call us`, `Clear search`). `destructive`: the red outline (`Sign out`). `destructive-filled`: red, only to confirm a
 * deletion. `inverted` and `secondary` are the 1.0 names, read as `outline` until their screens move to 3.0.
 */
type Variant = "primary" | "outline" | "destructive" | "destructive-filled" | "inverted" | "secondary";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * In flight: a small spinner before the words the caller passes (`Sending…`, `Saving…`); the pill keeps its colour
   * and taps are blocked until it settles (sheet 38, loading).
   */
  busy?: boolean;
  variant?: Variant;
  /** An icon before the label (`Call your specialist`, `Edit profile`). */
  icon?: IconName;
  /** After the label: `arrow` (`Continue →`) or `chevron` (`View request ›`, `Request a quote ›`). */
  trailing?: "arrow" | "chevron";
  /** The trailing glyph at the pill's right edge instead of beside the words (`Use these dates →`, `View request ›`). */
  trailingAtEdge?: boolean;
  /** The pill's height as the screen draws it (01 `Continue` 44.2, 04 36.6, 10 53.8 …); 44 by default. */
  height?: number;
  /** The words' type role (`button` by default; 04's `buttonBold`, 10's `buttonLg`, 11's `buttonDetail`, 12's
   *  `profilePill`, …): each screen's pills as it draws them. */
  text?: keyof typeof tokens.type;
  /** The icon's box (11: the filled handset at 21.4) and the space from it to the words (11: 14.75). */
  iconSize?: number;
  iconGap?: number;
  /** 1.0 prop, kept while its screens move to 3.0: `md` 44 pt, `lg` the default height. */
  size?: "lg" | "md";
  /** False: the pill hugs its words instead of spanning its row. */
  fill?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  disabled = false,
  busy = false,
  variant = "primary",
  icon,
  trailing,
  trailingAtEdge = false,
  size = "lg",
  height,
  text = "button",
  iconSize = 18,
  iconGap,
  fill = true,
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const tone = TONE[variant];
  const blocked = disabled || busy;
  const dimmed = disabled && !busy;
  const word = dimmed ? (variant === "primary" ? tokens.colors.textSecondary : tone.label.color) : tone.label.color;
  const glyph = String(word);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { minHeight: height ?? (size === "md" ? 44 : DEFAULT_HEIGHT) },
        fill ? styles.fill : styles.hug,
        iconGap != null && { gap: iconGap },
        tone.frame,
        dimmed && (variant === "primary" ? styles.primaryDisabled : styles.dimmed),
        pressed && !blocked && tone.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={glyph} style={styles.spinner} /> : null}
      {!busy && icon ? <Icon name={icon} size={iconSize} color={glyph} strokeWidth={2} /> : null}
      <Text style={[styles.label, rn(tokens.type[text]), tone.label, dimmed && { color: word }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing && !busy ? (
        <View style={trailingAtEdge ? styles.edge : styles.trailing}>
          <Icon name={trailing === "arrow" ? "arrow-right" : "chevron"} size={18} color={glyph} strokeWidth={1.8} />
        </View>
      ) : null}
    </Pressable>
  );
}

const TONE: Record<Variant, { frame: ViewStyle; pressed: ViewStyle; label: TextStyle }> = {
  primary: {
    frame: { backgroundColor: tokens.colors.actionPrimary },
    pressed: { backgroundColor: tokens.colors.actionPressed },
    label: { color: tokens.colors.textOnPhoto },
  },
  outline: {
    frame: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1, borderColor: tokens.colors.borderDefault },
    pressed: { backgroundColor: tokens.colors.surfaceTint },
    label: { color: tokens.colors.textPrimary },
  },
  destructive: {
    frame: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1.5, borderColor: tokens.colors.statusDanger },
    pressed: { backgroundColor: tokens.colors.statusDangerTint },
    label: { color: tokens.colors.statusDangerText },
  },
  "destructive-filled": {
    frame: { backgroundColor: tokens.colors.statusDangerText },
    pressed: { opacity: 0.9 },
    label: { color: tokens.colors.textOnPhoto },
  },
  inverted: {
    frame: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1, borderColor: tokens.colors.borderDefault },
    pressed: { backgroundColor: tokens.colors.surfaceTint },
    label: { color: tokens.colors.textPrimary },
  },
  secondary: {
    frame: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1, borderColor: tokens.colors.borderDefault },
    pressed: { backgroundColor: tokens.colors.surfaceTint },
    label: { color: tokens.colors.textPrimary },
  },
};

const DEFAULT_HEIGHT = 44;

const styles = StyleSheet.create({
  button: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs + 2,
  },
  fill: { alignSelf: "stretch" },
  hug: { alignSelf: "center" },
  primaryDisabled: { backgroundColor: tokens.colors.surfaceTint },
  dimmed: { opacity: 0.45 },
  spinner: { marginRight: tokens.space.xxs },
  label: { textAlign: "center", flexShrink: 1 },
  trailing: { marginLeft: tokens.space.xxs },
  edge: { position: "absolute", right: tokens.space.lg },
});
