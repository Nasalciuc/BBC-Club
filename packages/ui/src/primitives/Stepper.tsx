import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Under the label in slate (`Ages 18+`). */
  caption?: string;
  /** Before the label (`user` on onboarding's Adults, 01). */
  icon?: IconName;
  /** False: the control alone, without its card (inside a card that already holds rows). */
  card?: boolean;
  /** `onboarding`: 01's travelers card as measured (the adult, the words, the pill in three parts). */
  look?: "onboarding";
  testID: string;
};

/**
 * 01, measured (card top T, left L): the card 63.1 tall, radius 10, on a hairline; the adult 24.4 pt 17.75 in and 17.65
 * down (inside the hairline); the words 58.3 in, the label's baseline T+28.5, the caption's 15.4 under it; the pill 104 × 33.2, 11.7 from the
 * right and 13.5 down, in three parts — `−` 32.8 and `+` 33 on the soft tint, the count 38.2 on white between them;
 * the signs 17 pt at a 1.42-pt line.
 */
const ONB = {
  height: 63.1,
  radius: 10,
  icon: 24.4,
  iconLeft: 17.75,
  iconTop: 17.65,
  textLeft: 58.3,
  labelBaseline: 28.5,
  captionPitch: 15.4,
  pill: { width: 104, height: 33.2, right: 11.7, top: 13.5, minus: 32.8, plus: 33 },
  sign: 17,
} as const;
const onbLabel = tokens.type.travelerTitle;
const onbCaption = tokens.type.travelerSub;
const onbValue = tokens.type.stepperValue;

/**
 * Who travels (01, sheet 39): a white card on a hairline — the icon, the label over its caption, and the pill stepper
 * `− 1 +` in light tint at the right. At a bound a button dims to 40%. Bounds are the caller's (Passengers schema).
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9,
  disabled = false,
  caption,
  icon,
  card = true,
  look,
  testID,
}: Props) {
  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;
  if (look === "onboarding") {
    return (
      <View style={styles.onb} testID={testID}>
        <View style={styles.onbIcon}>
          <Icon name={icon ?? "adult"} size={ONB.icon} color={tokens.colors.textPrimary} strokeWidth={1.38} />
        </View>
        <View style={styles.onbText}>
          <Text style={[styles.onbLabel, disabled && styles.dim]}>{label}</Text>
          {caption ? <Text style={styles.onbCaption}>{caption}</Text> : null}
        </View>
        <View style={styles.onbPill}>
          <Pressable
            testID={`${testID}.minus`}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label}`}
            accessibilityState={{ disabled: atMin }}
            disabled={atMin}
            hitSlop={ONB_SLOP}
            onPress={() => onChange(Math.max(min, value - 1))}
            style={({ pressed }) => [styles.onbSide, { width: ONB.pill.minus }, pressed && !atMin && styles.pressed]}
          >
            <View style={atMin && styles.dim}>
              <Icon name="minus" size={ONB.sign} color={tokens.colors.textOnTint} strokeWidth={2} />
            </View>
          </Pressable>
          <View style={styles.onbCount}>
            <Text style={[styles.onbValue, disabled && styles.dim]} accessibilityLabel={`${label}: ${value}`}>
              {value}
            </Text>
          </View>
          <Pressable
            testID={`${testID}.plus`}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label}`}
            accessibilityState={{ disabled: atMax }}
            disabled={atMax}
            hitSlop={ONB_SLOP}
            onPress={() => onChange(Math.min(max, value + 1))}
            style={({ pressed }) => [styles.onbSide, { width: ONB.pill.plus }, pressed && !atMax && styles.pressed]}
          >
            <View style={atMax && styles.dim}>
              <Icon name="plus" size={ONB.sign} color={tokens.colors.textOnTint} strokeWidth={2} />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.row, card && styles.card]} testID={testID}>
      {icon ? <Icon name={icon} size={28} color={tokens.colors.textPrimary} strokeWidth={1.5} /> : null}
      <View style={styles.text}>
        <Text style={[styles.label, disabled && styles.dim]}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View style={styles.pill}>
        <Pressable
          testID={`${testID}.minus`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          hitSlop={4}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [styles.btn, atMin && styles.dim, pressed && !atMin && styles.pressed]}
        >
          <Icon name="minus" size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.value, disabled && styles.dim]} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Pressable
          testID={`${testID}.plus`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          hitSlop={4}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.btn, atMax && styles.dim, pressed && !atMax && styles.pressed]}
        >
          <Icon name="plus" size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
      </View>
    </View>
  );
}

/** The pill's parts are 33 pt square: the target reaches 44 around each. */
const ONB_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

const styles = StyleSheet.create({
  onb: {
    minHeight: ONB.height,
    borderRadius: ONB.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.soft,
  },
  onbIcon: { position: "absolute", left: ONB.iconLeft, top: ONB.iconTop },
  onbText: {
    marginLeft: ONB.textLeft,
    marginRight: ONB.pill.right + ONB.pill.width + 8,
    // the card is 01's height (its minimum, a little more than the words need); more words grow it
    paddingBottom: ONB.height - ONB.labelBaseline - ONB.captionPitch - belowBaseline(onbCaption) - 4,
  },
  onbLabel: {
    ...rn(onbLabel),
    color: tokens.colors.textPrimary,
    marginTop: ONB.labelBaseline - baselineOffset(onbLabel),
  },
  onbCaption: {
    ...rn(onbCaption),
    color: tokens.colors.textSecondary,
    marginTop: ONB.captionPitch - belowBaseline(onbLabel) - baselineOffset(onbCaption),
  },
  onbPill: {
    position: "absolute",
    right: ONB.pill.right,
    top: ONB.pill.top,
    width: ONB.pill.width,
    height: ONB.pill.height,
    flexDirection: "row",
    borderRadius: ONB.pill.height / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceTintSoft,
    overflow: "hidden",
  },
  onbSide: { height: "100%", alignItems: "center", justifyContent: "center" },
  onbCount: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.colors.surfaceCard },
  onbValue: { ...rn(onbValue), color: tokens.colors.textPrimary, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: 56 },
  card: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
    minHeight: 72,
  },
  text: { flex: 1, gap: 2 },
  label: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  caption: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceTint,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    overflow: "hidden",
  },
  btn: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  value: {
    ...rn(tokens.type.subtitle),
    color: tokens.colors.textPrimary,
    minWidth: 40,
    height: 40,
    lineHeight: 40,
    textAlign: "center",
    backgroundColor: tokens.colors.surfaceCard,
  },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
