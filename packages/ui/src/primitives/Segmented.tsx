import { Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Option<K extends string> = { key: K; label: string; testID: string };

type Props<K extends string> = {
  options: readonly Option<K>[];
  value: K;
  onChange: (key: K) => void;
  disabled?: boolean;
  /** `request`: the request sheet's (06, 22, 23), as measured. Without one, sheet 39's. */
  look?: "request";
};

/**
 * 06: two segments 24.8 tall, 9.5 apart, radius 4.5; the chosen navy with its words white in Semibold, the other
 * white on a hairline with its words navy; while the request sends (23) the other rests in the light tint, its words
 * slate.
 */
const REQUEST = {
  height: 24.8,
  gap: 9.5,
  radius: 4.5,
  // As the web harness renders them, the words under the segment's middle: the chosen 0.55, the other 1.
  drop: { on: 0.55, off: 1 },
  on: rn(tokens.type.segmentOn) as TextStyle,
  off: rn(tokens.type.segmentOff) as TextStyle,
} as const;

/** The segmented control of sheet 39 (`Round trip` / `One way`): two white segments on a hairline; the chosen is navy. */
export function Segmented<K extends string>({ options, value, onChange, disabled = false, look }: Props<K>) {
  const drawn = look === "request" ? REQUEST : null;
  return (
    <View style={[styles.row, drawn ? { gap: drawn.gap } : null]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            hitSlop={drawn ? { top: (44 - drawn.height) / 2, bottom: (44 - drawn.height) / 2 } : undefined}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [
              styles.segment,
              drawn
                ? {
                    minHeight: drawn.height,
                    borderRadius: drawn.radius,
                    paddingHorizontal: 6,
                    paddingTop: 2 * (on ? drawn.drop.on : drawn.drop.off),
                  }
                : null,
              on ? styles.on : drawn ? styles.offDrawn : styles.off,
              disabled && !on && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text
              style={[
                drawn ? (on ? drawn.on : drawn.off) : on ? styles.onLabel : styles.offLabel,
                { color: on ? tokens.colors.textOnPhoto : tokens.colors.textPrimary },
                disabled && !on && styles.disabledLabel,
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {drawn && !on && !disabled ? (
              // The hairline over the segment's edge: it does not move the words from where the image centres them.
              <View pointerEvents="none" style={[styles.edge, { borderRadius: drawn.radius }]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.sm },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.sm,
  },
  on: { backgroundColor: tokens.colors.actionPrimary },
  off: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1, borderColor: tokens.colors.borderDefault },
  offDrawn: { backgroundColor: tokens.colors.surfaceCard },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderDefault,
  },
  disabled: { backgroundColor: tokens.colors.surfaceTint },
  disabledLabel: { color: tokens.colors.textLabel },
  pressed: { opacity: 0.85 },
  onLabel: { ...rn(tokens.type.bodyStrong) },
  offLabel: { ...rn(tokens.type.body) },
});
