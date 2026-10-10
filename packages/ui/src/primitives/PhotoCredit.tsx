import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** One line, as the photo's licence asks: `Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons`. */
  label: string;
  /** The same words for a screen reader, without the separators. */
  accessibilityLabel: string;
  /** Opens the photo's own page (its author, its licence); none — the line is only read. */
  onPress?: () => void;
  testID: string;
};

/** DESIGN.md, Accessibility: a text link gets a 44 pt hit area. The row is that high; the line sits in its middle. */
const TARGET = 44;

/**
 * The credit a photograph owes (ADR-IMPL-043): small type under it, `text-tertiary` — a non-essential line — opening
 * the photo's page. Not a button: it reads as a caption. Its row is the 44 pt a text link needs, link or not, so the
 * space under a photo is the same either way.
 */
export function PhotoCredit({ label, accessibilityLabel, onPress, testID }: Props) {
  if (!onPress) {
    return (
      <View style={styles.row}>
        <Text testID={testID} style={styles.text} accessibilityLabel={accessibilityLabel}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ left: tokens.space.xs, right: tokens.space.xs }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TARGET, justifyContent: "center", alignSelf: "flex-start" },
  text: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary },
  pressed: { opacity: 0.6 },
});
