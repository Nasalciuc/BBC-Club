import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { TextButton } from "./TextButton";

type Props = {
  title: string;
  /** `See all ›`, `Clear all`, `Done`: a text button at the right. */
  action?: { label: string; onPress: () => void; testID: string; chevron?: boolean };
  /**
   * `title` 24 Bold (Explore's sections), `small` 20 Bold (Search's, 03), or `subtitle` 17 Semibold (onboarding's
   * groups, `Other great fares`).
   */
  size?: "title" | "small" | "subtitle";
  testID?: string;
};

/** A section's title with its action at the right (02 `Offers to inspire  See all ›`, 03 `Recent searches  Clear all`). */
export function SectionHeader({ title, action, size = "title", testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles[size]} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {action ? (
        <View style={styles.action}>
          <TextButton label={action.label} onPress={action.onPress} testID={action.testID} chevron={action.chevron} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  // The target overhangs the row: 44 pt tall, the row as tall as its title.
  action: { marginVertical: -tokens.space.sm },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flexShrink: 1 },
  small: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, flexShrink: 1 },
  subtitle: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary, flexShrink: 1 },
});
