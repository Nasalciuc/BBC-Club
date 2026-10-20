import { Image } from "expo-image";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { Button } from "../primitives/Button";
import type { PhotoSource } from "../primitives/Photo";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Look = "requests" | "explore" | "search";

type Props = {
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void; testID?: string };
  /** `outline` for a quiet way out (`Clear search`, 15). */
  primaryVariant?: "primary" | "outline";
  /** False: the pill hugs its words, centred (`Search a destination`, 17). */
  primaryFill?: boolean;
  /** A picture above the words (10: the seat, the window, the boarding pass — the design's complete illustration). */
  illustration?: PhotoSource;
  /** The picture's width over its height; 1 by default. */
  illustrationRatio?: number;
  /**
   * How far the picture runs past the column, each side (negative margins): 10's picture is a 386-pt square from 7 pt
   * in to the screen's edge, wider than the words' gutter.
   */
  bleed?: { left: number; right: number };
  /** An icon above the words (15: the magnifier). */
  icon?: IconName;
  /**
   * The screen it stands in, as measured: `requests` (10: 33.5-pt title, 16.5-pt words, a 53.8-pt full-width pill),
   * `explore` (17: 21.5 / 14, a 43.4-pt pill hugging its words), `search` (15: the magnifier, 18 / 14.5, a 33.2-pt
   * outline pill).
   */
  look?: Look;
  testID: string;
};

type Geometry = {
  title: TextStyle & { fontSize: number; lineHeight: number };
  body: TextStyle & { fontSize: number; lineHeight: number };
  /** From the picture's (or icon's) foot to the title's baseline. */
  toTitle: number;
  /** From the title's baseline to the first line's. */
  toBody: number;
  /** From the last line's baseline to the pill. */
  toPill: number;
  pill: { height: number; text: "button" | "buttonSm" | "buttonLg"; padding?: number };
  icon?: { size: number; stroke: number };
  bodyWidth?: number;
};

const LOOK: Record<Look, Geometry> = {
  requests: {
    title: rn(tokens.type.emptyTitle) as Geometry["title"],
    body: rn(tokens.type.emptyBody) as Geometry["body"],
    toTitle: 36.9,
    toBody: 32.2,
    toPill: 38.9,
    pill: { height: 53.8, text: "buttonLg" },
    bodyWidth: 290,
  },
  explore: {
    title: rn(tokens.type.title) as Geometry["title"],
    body: rn(tokens.type.body) as Geometry["body"],
    toTitle: 0,
    toBody: 32.5,
    toPill: 28.6,
    pill: { height: 43.4, text: "buttonSm", padding: 48.9 },
    bodyWidth: 260,
  },
  search: {
    title: rn(tokens.type.emptyTitleSm) as Geometry["title"],
    body: rn(tokens.type.emptyBodySm) as Geometry["body"],
    toTitle: 28.5,
    toBody: 25.8,
    toPill: 18.1,
    pill: { height: 33.2, text: "buttonSm", padding: 30.5 },
    icon: { size: 36, stroke: 1.3 },
    bodyWidth: 300,
  },
};

/**
 * An empty state (10, 15, 17; sheet 41): centred — a picture or an icon, the title, the words in slate, then the way
 * on — at the sizes and gaps its screen draws. The parent gives the gutters.
 */
export function EmptyState({
  title,
  body,
  primary,
  primaryVariant = "primary",
  primaryFill = true,
  illustration,
  illustrationRatio = 1,
  bleed,
  icon,
  look = "requests",
  testID,
}: Props) {
  const g = LOOK[look];
  const titleTop = g.toTitle - baselineOffset(g.title);
  const bodyTop = g.toBody - belowBaseline(g.title) - baselineOffset(g.body);
  const pillTop = g.toPill - belowBaseline(g.body);
  return (
    <View style={styles.wrap} testID={testID}>
      {illustration ? (
        <Image
          source={illustration}
          style={[
            styles.illustration,
            { aspectRatio: illustrationRatio },
            bleed ? { marginLeft: bleed.left, marginRight: bleed.right } : null,
          ]}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : null}
      {icon ? (
        <Icon
          name={icon}
          size={g.icon?.size ?? 36}
          color={tokens.colors.textSecondary}
          strokeWidth={g.icon?.stroke ?? 1.5}
        />
      ) : null}
      <Text style={[g.title, styles.title, { marginTop: titleTop }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[g.body, styles.body, { marginTop: bodyTop, maxWidth: g.bodyWidth }]}>{body}</Text>
      {primary ? (
        <Button
          testID={primary.testID ?? `${testID}.primary`}
          label={primary.label}
          onPress={primary.onPress}
          variant={primaryVariant}
          fill={primaryFill}
          height={g.pill.height}
          text={g.pill.text}
          style={{
            marginTop: pillTop,
            ...(primaryFill ? {} : { paddingHorizontal: g.pill.padding ?? tokens.space.xxl }),
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", alignItems: "center" },
  illustration: { alignSelf: "stretch" },
  title: { color: tokens.colors.textPrimary, textAlign: "center" },
  body: { color: tokens.colors.textSecondary, textAlign: "center" },
});
