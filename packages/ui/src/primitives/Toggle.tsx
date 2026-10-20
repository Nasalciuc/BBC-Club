import { Pressable, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";

type Props = {
  value: boolean;
  onChange?: (next: boolean) => void;
  accessibilityLabel: string;
  testID: string;
  /** A switch the member cannot change (`Request updates`, always on): shown at 40%. */
  locked?: boolean;
  disabled?: boolean;
};

/** The toggle of sheet 39: 52 × 32, navy on with the white knob at the right; light navy off. */
export function Toggle({ value, onChange, accessibilityLabel, testID, locked = false, disabled = false }: Props) {
  const fixed = locked || disabled || onChange == null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: fixed }}
      disabled={fixed}
      hitSlop={6}
      onPress={() => onChange?.(!value)}
      style={[styles.track, value ? styles.on : styles.off, (locked || disabled) && styles.locked]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: tokens.radius.pill, padding: 3, justifyContent: "center" },
  on: { backgroundColor: tokens.colors.actionPrimary, alignItems: "flex-end" },
  off: { backgroundColor: tokens.colors.borderDefault, alignItems: "flex-start" },
  locked: { opacity: 0.4 },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  knobOn: {},
  knobOff: {},
});
