import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Option<K extends string> = { key: K; label: string; testID: string };

type Props<K extends string> = {
  options: readonly Option<K>[];
  value: K;
  onChange: (key: K) => void;
  disabled?: boolean;
};

/** The segmented control of sheet 39 (`Round trip` / `One way`): two white segments on a hairline; the chosen is navy. */
export function Segmented<K extends string>({ options, value, onChange, disabled = false }: Props<K>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [
              styles.segment,
              on ? styles.on : styles.off,
              disabled && !on && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text style={[on ? styles.onLabel : styles.offLabel]} numberOfLines={1}>
              {o.label}
            </Text>
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
  disabled: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.85 },
  onLabel: { ...rn(tokens.type.bodyStrong), color: tokens.colors.textOnPhoto },
  offLabel: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
});
