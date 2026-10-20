import { StyleSheet, Text, View } from "react-native";
import { baselineOffset, rn } from "../rn-type";
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
  /**
   * `explore` (02): `Offers to inspire` in `title-lg`; `See all` in its own Regular with its baseline 3.7 above the
   * title's, the chevron 17 pt at a 1.4 line 1.9 after the words — the action at the row's right edge, which the
   * screen sets (13.7 from the screen's).
   */
  look?: "explore";
  testID?: string;
};

const EXPLORE_ACTION_RISE = 3.7;

/** A section's title with its action at the right (02 `Offers to inspire  See all ›`, 03 `Recent searches  Clear all`). */
export function SectionHeader({ title, action, size = "titleSm", look, testID }: Props) {
  if (look === "explore") {
    const titleType = tokens.type.titleLg;
    const actionType = tokens.type.seeAll;
    return (
      <View testID={testID}>
        <Text style={[styles.heading, rn(titleType), styles.exploreTitle]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {action ? (
          <View
            style={[
              styles.exploreAction,
              { top: baselineOffset(titleType) - EXPLORE_ACTION_RISE - baselineOffset(actionType) },
            ]}
          >
            <TextButton
              label={action.label}
              onPress={action.onPress}
              testID={action.testID}
              chevron={action.chevron}
              tone={action.tone ?? "primary"}
              text="seeAll"
              chevronSize={17}
              chevronStroke={2}
              chevronGap={1.9}
            />
          </View>
        ) : null}
      </View>
    );
  }
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
  exploreTitle: { marginRight: 96 },
  exploreAction: { position: "absolute", right: 0 },
  heading: { color: tokens.colors.textPrimary, flexShrink: 1 },
  titleLg: { ...rn(tokens.type.titleLg) },
  title: { ...rn(tokens.type.title) },
  titleSm: { ...rn(tokens.type.titleSm) },
  subtitle: { ...rn(tokens.type.subtitle) },
});
