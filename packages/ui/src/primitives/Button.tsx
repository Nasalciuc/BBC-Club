import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { buttonHitSlop, type Slop } from "./hit-slop";

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
  /** The corners as the screen draws them (01's `Continue`: 19 on a 45-pt pill); a full pill by default. */
  radius?: number;
  /** The trailing glyph's box, line and its space from the words' box (01: the arrow 17 pt at 2, 5.4 from `Continue`). */
  trailingSize?: number;
  trailingStroke?: number;
  trailingGap?: number;
  /** 1.0 prop, kept while its screens move to 3.0: `md` 44 pt, `lg` the default height. */
  size?: "lg" | "md";
  /** False: the pill hugs its words instead of spanning its row. */
  fill?: boolean;
  /** The words centred in the pill and the trailing glyph after them, outside the centring (13 `Request a quote ›`). */
  centreWords?: boolean;
  /** A primary pill's disabled colours as its screen draws them (24: a pale blue, its words and arrow a blue grey);
   *  the light tint and slate by default. */
  disabledColors?: { background: string; label: string };
  /** The trailing glyph (`arrow-long`, 07's arrow) in place of the one `trailing` names. */
  trailingIcon?: IconName;
  /** With `trailingAtEdge`: the glyph's box from the pill's right edge (07: 15.15); 24 by default. */
  trailingInset?: number;
  /** The words and the trailing glyph moved from where the pill centres them, as the screen draws them (pt; > 0 right
   *  and down) — a translation, so the pill's size and its target do not change. */
  labelOffset?: { x: number; y: number };
  trailingOffset?: { x: number; y: number };
  /** How far the target reaches past the drawn pill: to 44 pt tall by default (`buttonHitSlop`); a screen whose
   *  neighbours sit closer passes its own. The holder keeps that room (a touch lands only inside it). */
  hitSlop?: Slop;
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
  radius,
  trailingSize = 18,
  trailingStroke = 1.8,
  trailingGap,
  fill = true,
  centreWords = false,
  disabledColors,
  trailingIcon,
  trailingInset,
  labelOffset,
  trailingOffset,
  hitSlop,
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const tone = TONE[variant];
  const drawnHeight = height ?? (size === "md" ? 44 : DEFAULT_HEIGHT);
  const blocked = disabled || busy;
  const dimmed = disabled && !busy;
  const word = dimmed
    ? variant === "primary"
      ? (disabledColors?.label ?? tokens.colors.textSecondary)
      : tone.label.color
    : tone.label.color;
  const trailingName: IconName = trailingIcon ?? (trailing === "arrow" ? "arrow-right" : "chevron");
  const moveLabel = labelOffset ? { transform: [{ translateX: labelOffset.x }, { translateY: labelOffset.y }] } : null;
  const moveTrailing = trailingOffset
    ? { transform: [{ translateX: trailingOffset.x }, { translateY: trailingOffset.y }] }
    : null;
  const glyph = String(word);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      // Tap targets ≥ 44 pt: a pill drawn smaller reaches it by its slop (DESIGN.md · Accessibility, F029).
      hitSlop={buttonHitSlop(drawnHeight, hitSlop)}
      style={({ pressed }) => [
        styles.button,
        { minHeight: drawnHeight },
        fill ? styles.fill : styles.hug,
        iconGap != null && { gap: iconGap },
        radius != null && { borderRadius: radius },
        tone.frame,
        dimmed &&
          (variant === "primary"
            ? disabledColors
              ? { backgroundColor: disabledColors.background }
              : styles.primaryDisabled
            : styles.dimmed),
        pressed && !blocked && tone.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={glyph} style={styles.spinner} /> : null}
      {!busy && icon ? <Icon name={icon} size={iconSize} color={glyph} strokeWidth={2} /> : null}
      {centreWords && trailing && !busy ? (
        <View>
          <Text style={[styles.label, rn(tokens.type[text]), tone.label, dimmed && { color: word }]} numberOfLines={1}>
            {label}
          </Text>
          <View style={[styles.afterWords, { marginLeft: trailingGap ?? tokens.space.xxs }]}>
            <Icon name={trailingName} size={trailingSize} color={glyph} strokeWidth={trailingStroke} />
          </View>
        </View>
      ) : (
        <Text
          style={[styles.label, rn(tokens.type[text]), tone.label, dimmed && { color: word }, moveLabel]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
      {trailing && !busy && !centreWords ? (
        <View
          style={
            trailingAtEdge
              ? [styles.edge, trailingInset != null && { right: trailingInset }, moveTrailing]
              : trailingGap != null
                ? { marginLeft: trailingGap - (iconGap ?? GAP) }
                : styles.trailing
          }
        >
          <Icon name={trailingName} size={trailingSize} color={glyph} strokeWidth={trailingStroke} />
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
  // 35 draws the pill a lighter red (#F34649), under which its white words fall to 3.6:1: the club's red keeps 4.6:1.
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
/** The space between the pill's parts (icon, words, trailing glyph). */
const GAP = tokens.space.xs + 2;

const styles = StyleSheet.create({
  button: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: GAP,
  },
  fill: { alignSelf: "stretch" },
  hug: { alignSelf: "center" },
  primaryDisabled: { backgroundColor: tokens.colors.surfaceTint },
  dimmed: { opacity: 0.45 },
  spinner: { marginRight: tokens.space.xxs },
  label: { textAlign: "center", flexShrink: 1 },
  trailing: { marginLeft: tokens.space.xxs },
  edge: { position: "absolute", right: tokens.space.lg },
  afterWords: { position: "absolute", left: "100%", top: 0, bottom: 0, justifyContent: "center" },
});
