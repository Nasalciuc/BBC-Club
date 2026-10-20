import type { ReactNode } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { BackButton } from "../primitives/BackButton";
import { Wordmark } from "../primitives/Wordmark";
import { baselineOffset, rn } from "../rn-type";
import { tokens } from "../tokens";

type Look = "settings" | "edit";

/**
 * 07, under the safe area (pt): the bar is centred on the safe area's edge — the chevron, the wordmark and the
 * profile button stand half in the status bar's height — and the page's first card starts 19 pt under it.
 */
const DATES = {
  chevron: { size: 23.3, stroke: 1.25, x: 22.18, y: -0.08 },
  /** `BuyBusinessClass Club`, centred; its baseline. */
  wordmark: { baseline: 5.74 },
  /** The action's centre, from the bar's right edge and the safe area's edge. */
  right: { x: 26.32, y: 0.34 },
  height: 19.04,
} as const;

type Props = {
  /** The page's name beside the back chevron (`Settings`, `Edit profile`, 34, 36); none — the wordmark in the middle (07). */
  title?: string;
  onBack?: () => void;
  backTestID?: string;
  /** At the right: the round profile button (07). */
  right?: ReactNode;
  /**
   * The bar as its screen draws it (34, 36): the chevron's box, stroke and centre, the title's role and where its ink
   * starts, and how far below the safe area the page's first card starts — the bar's height. `dates` (07): the
   * chevron, the wordmark centred and the action (`right`, the profile button) as the dates page draws them.
   */
  look?: Look | "dates";
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
  if (look === "dates") {
    // The wordmark's line is set by its larger part (` Club`): its baseline sits that role's offset under the top.
    const clubLine = {
      fontSize: tokens.type.wordmarkDatesClub.fontSize,
      lineHeight: tokens.type.wordmarkDates.lineHeight,
    };
    return (
      <View style={[styles.measured, { height: DATES.height }]} testID={testID}>
        {onBack ? (
          // The 44-pt target starts at the safe area's edge and the chevron is lifted to where 07 draws it, half in the
          // status bar: Android gives a touch in the status bar to the system, so a target centred on that edge
          // missed every tap at its middle.
          <BackButton
            testID={backTestID}
            onPress={onBack}
            variant="plain"
            glyph={{
              size: DATES.chevron.size,
              stroke: DATES.chevron.stroke,
              offset: { x: 0, y: DATES.chevron.y - 22 },
            }}
            style={{ position: "absolute", left: DATES.chevron.x - 22, top: 0 }}
          />
        ) : null}
        <View
          pointerEvents="box-none"
          style={[styles.datesWordmark, { top: DATES.wordmark.baseline - baselineOffset(clubLine) }]}
        >
          <Wordmark look="dates" />
        </View>
        {right ? (
          <View style={[styles.datesRight, { right: DATES.right.x, top: DATES.right.y }]} pointerEvents="box-none">
            {right}
          </View>
        ) : null}
      </View>
    );
  }
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
  datesWordmark: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  // A zero-size anchor at the action's centre: the action is centred on it whatever its size.
  datesRight: { position: "absolute", width: 0, height: 0, alignItems: "center", justifyContent: "center" },
});
