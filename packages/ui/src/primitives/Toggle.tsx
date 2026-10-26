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

/**
 * 07 (`Keep the dates flexible`), as measured: a 40.6 × 24 track, the white knob 21 across 1.5 inside it with its
 * shadow; off, the track a light grey with the knob at the left; on, navy with the knob at the right.
 */
const TOGGLE = { width: 40.6, height: 24, inset: 1.5 } as const;
const KNOB = TOGGLE.height - 2 * TOGGLE.inset;
/**
 * How far the target reaches past the drawn track, 44 pt and more each way. A touch lands only inside the
 * toggle's parent, so a parent that hugs the track leaves this room.
 */
export const TOGGLE_SLOP = {
  top: (44 - TOGGLE.height) / 2,
  bottom: (44 - TOGGLE.height) / 2,
  left: 4,
  right: 4,
} as const;

export function Toggle({ value, onChange, accessibilityLabel, testID, locked = false, disabled = false }: Props) {
  const fixed = locked || disabled || onChange == null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: fixed }}
      disabled={fixed}
      // The target reaches 44 pt around the drawn track.
      hitSlop={TOGGLE_SLOP}
      onPress={() => onChange?.(!value)}
      style={[styles.track, value ? styles.on : styles.off, (locked || disabled) && styles.locked]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TOGGLE.width,
    height: TOGGLE.height,
    borderRadius: TOGGLE.height / 2,
    padding: TOGGLE.inset,
    justifyContent: "center",
  },
  on: { backgroundColor: tokens.colors.actionPrimary, alignItems: "flex-end" },
  off: { backgroundColor: tokens.colors.toggleOff, alignItems: "flex-start" },
  locked: { opacity: 0.4 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.knob,
  },
});
