import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { TextButton } from "./TextButton";

type Size = "titleLg" | "title" | "titleSm" | "subtitle";

type Props = {
  title: string;
  /** `See all ›`, `Clear all`, `Done`: a text button at the right. */
  action?: {
    label: string;
    onPress: () => void;
    testID: string;
    chevron?: boolean;
    tone?: "primary" | "link";
  };
  /**
   * The title's style as the screen draws it: `titleLg` 23.5 (02 `Offers to inspire`), `title` 21 (18 `Airports`, 11
   * `Request progress`), `titleSm` 17.5 (03 `Popular from New York`), `subtitle` 15.5 (01's groups).
   */
  size?: Size;
  testID?: string;
};

/** A section's title with its action at the right (02 `Offers to inspire  See all ›`, 03 `Recent searches  Clear all`). */
export function SectionHeader({ title, action, size = "titleSm", testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.heading, styles[size]]} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {action ? (
        <View style={styles.action}>
          <TextButton
            label={action.label}
            onPress={action.onPress}
            testID={action.testID}
            chevron={action.chevron}
            tone={action.tone ?? "primary"}
            size="linkSm"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  action: {},
  heading: { color: tokens.colors.textPrimary, flexShrink: 1 },
  titleLg: { ...rn(tokens.type.titleLg) },
  title: { ...rn(tokens.type.title) },
  titleSm: { ...rn(tokens.type.titleSm) },
  subtitle: { ...rn(tokens.type.subtitle) },
});
