import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  /**
   * `plain`: the chevron alone, in a top bar (07, 34, 36). `photo`: a round white button over a photograph (05, 13).
   * `glass`: the translucent round button over a request's photograph (11, 30–33). `tint`: the round button on a white
   * page; `round`: 26's, in its own neutral grey.
   */
  variant?: "plain" | "photo" | "glass" | "tint" | "round";
  /** The circle's diameter as the screen draws it (11: 35); 44 by default. The target stays 44 pt by its hit slop. */
  diameter?: number;
  /**
   * The chevron's box and stroke as the screen draws them (11: 24 at 1.6), and where it stands off the circle's middle
   * (26: 1.17 to the left, 0.22 down).
   */
  glyph?: { size: number; stroke: number; offset?: { x: number; y: number } };
  style?: ViewStyle;
};

const TARGET = 44;

/** Back (component sheet 38, round photo buttons; sheet 42, top bar): a 44-pt target, the chevron. Never the word Back. */
export function BackButton({ onPress, testID, variant = "plain", diameter = TARGET, glyph, style }: Props) {
  const slop = Math.max(0, (TARGET - diameter) / 2);
  const size = glyph?.size ?? (variant === "plain" ? 28 : 24);
  const offset = glyph?.offset;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={slop + 8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hit,
        { width: diameter, height: diameter, borderRadius: diameter / 2 },
        variant === "photo" && styles.photo,
        variant === "glass" && styles.glass,
        variant === "tint" && styles.tint,
        variant === "round" && styles.round,
        style,
        pressed && styles.pressed,
      ]}
    >
      <View style={offset ? { transform: [{ translateX: offset.x }, { translateY: offset.y }] } : null}>
        <Icon name="chevron-left" size={size} color={tokens.colors.textPrimary} strokeWidth={glyph?.stroke ?? 2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: "center", justifyContent: "center" },
  photo: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  // 11: white at about 90 %, the sky faintly through it; no shadow.
  glass: { backgroundColor: tokens.colors.photoButton },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  round: { backgroundColor: tokens.colors.surfaceRound },
  pressed: { opacity: 0.75 },
});
