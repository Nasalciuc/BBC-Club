import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Tone = "primary" | "secondary" | "muted" | "link";

type Props = {
  label: string;
  onPress: () => void;
  testID: string;
  /** `See all ›`. */
  chevron?: boolean;
  /**
   * `primary` navy (`See all`, `Done`), `secondary` slate (`Skip`, `Not now`), `link` the deeper blue Search draws
   * `Cancel` and `Clear all` in (03, 18).
   */
  tone?: Tone;
  /** The words' style: `link` 13.5 (`Cancel`), `linkSm` 12 Medium (`Clear all`, `See all`), `button`. */
  size?: "link" | "linkSm" | "button";
  /** A type role of the screen's own, over `size` (01's `Skip`: `skip`). */
  text?: keyof typeof tokens.type;
  /** The chevron's box, line and space after the words' box, as the screen draws it (02: 17 at 2, 1.9 after). */
  chevronSize?: number;
  chevronStroke?: number;
  chevronGap?: number;
  disabled?: boolean;
};

const COLOR: Record<Tone, string> = {
  primary: tokens.colors.textPrimary,
  secondary: tokens.colors.textSecondary,
  // 01's `Skip`: the lighter slate the image draws it in.
  muted: tokens.colors.textMuted,
  link: tokens.colors.textLink,
};

/**
 * The text buttons of sheet 38: the words alone. The words are the button's box — the screens place them where the
 * images do — and the target reaches 44 pt around them by its hit slop.
 */
export function TextButton({
  label,
  onPress,
  testID,
  chevron = false,
  tone = "primary",
  size = "link",
  text,
  chevronSize = 16,
  chevronStroke = 2,
  chevronGap,
  disabled = false,
}: Props) {
  const color = COLOR[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, (pressed || disabled) && styles.pressed]}
    >
      <View style={[styles.row, chevronGap != null && { gap: chevronGap }]}>
        <Text style={[text ? rn(tokens.type[text]) : styles[size], { color }]}>{label}</Text>
        {chevron ? <Icon name="chevron" size={chevronSize} color={color} strokeWidth={chevronStroke} /> : null}
      </View>
    </Pressable>
  );
}

/** Around a 16-pt line of words: 44 pt tall, and wide enough for a short word like `Done`. */
const HIT_SLOP = { top: 14, bottom: 14, left: 10, right: 10 } as const;

const styles = StyleSheet.create({
  hit: { justifyContent: "center", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.xxs },
  link: { ...rn(tokens.type.link) },
  linkSm: { ...rn(tokens.type.linkSm) },
  button: { ...rn(tokens.type.button) },
  pressed: { opacity: 0.55 },
});
