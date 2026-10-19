import type { ReactNode } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { BackButton } from "../primitives/BackButton";
import { Wordmark } from "../primitives/Wordmark";
import { baselineOffset, rn } from "../rn-type";
import { tokens } from "../tokens";

type Look = "settings" | "edit";

type Props = {
  /** The page's name beside the back chevron (`Settings`, `Edit profile`, 34, 36); none — the wordmark in the middle (07). */
  title?: string;
  onBack?: () => void;
  backTestID?: string;
  /** At the right: the round profile button (07). */
  right?: ReactNode;
  /**
   * The bar as its screen draws it (34, 36): the chevron's box, stroke and centre, the title's role and where its ink
   * starts, and how far below the safe area the page's first card starts — the bar's height.
   */
  look?: Look;
  testID?: string;
};

type Geometry = {
  chevron: { size: number; stroke: number; x: number; y: number };
  title: TextStyle & { fontSize: number; lineHeight: number };
  titleLeft: number;
  titleBaseline: number;
  height: number;
};

/** 34 and 36, measured on a 47-pt status bar (pt under the safe area). */
const LOOK: Record<Look, Geometry> = {
  settings: {
    chevron: { size: 30.6, stroke: 1.73, x: 23.8, y: 15.8 },
    title: rn(tokens.type.settingsTitle) as Geometry["title"],
    titleLeft: 47.0 - 1.2,
    titleBaseline: 23.6,
    height: 52.2,
  },
  edit: {
    chevron: { size: 26.8, stroke: 1.61, x: 24.5, y: 16.9 },
    title: rn(tokens.type.editTitle) as Geometry["title"],
    titleLeft: 55.8 - 1.2,
    titleBaseline: 24,
    height: 54.3,
  },
};

/** The top bar (sheet 42): the back chevron, the wordmark centred or the page's title beside it, an action at the right. */
export function TopBar({ title, onBack, backTestID = "topbar.back", right, look, testID }: Props) {
  if (look && title) {
    const g = LOOK[look];
    return (
      <View style={[styles.measured, { height: g.height }]} testID={testID}>
        {onBack ? (
          <BackButton
            testID={backTestID}
            onPress={onBack}
            variant="plain"
            glyph={{ size: g.chevron.size, stroke: g.chevron.stroke }}
            style={{ position: "absolute", left: g.chevron.x - 22, top: g.chevron.y - 22 }}
          />
        ) : null}
        <Text
          style={[g.title, styles.measuredTitle, { left: g.titleLeft, top: g.titleBaseline - baselineOffset(g.title) }]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {title}
        </Text>
        {right ? <View style={styles.measuredRight}>{right}</View> : null}
      </View>
    );
  }
  return (
    <View style={styles.bar} testID={testID}>
      {onBack ? <BackButton testID={backTestID} onPress={onBack} variant="plain" /> : <View style={styles.side} />}
      {title ? (
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.centre}>
          <Wordmark />
        </View>
      )}
      {right ?? (title ? null : <View style={styles.side} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.sm,
  },
  side: { width: 44, height: 44 },
  centre: { flex: 1, alignItems: "center" },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, flex: 1 },
  measured: { alignSelf: "stretch" },
  measuredTitle: { position: "absolute", right: 60, color: tokens.colors.textPrimary },
  measuredRight: { position: "absolute", right: tokens.space.gutter, top: 0, bottom: 0, justifyContent: "center" },
});
