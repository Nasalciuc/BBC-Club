import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { StatusBadge, statusCopy, type BadgeStatus } from "../primitives/StatusBadge";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The destination's photograph (ADR-IMPL-043, ADR-IMPL-056); null — the fallback. */
  photo: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `memory` for a satellite view (its terms ask that it not be kept). */
  cachePolicy?: "memory" | "disk";
  /** The destination's city (`London`); the route stands in when the city is unknown. */
  city: string;
  /** `JFK → LHR`. */
  route: string;
  /** `Nov 12 – 19, 2026`; null when the request names no day. */
  dates: string | null;
  /** The request's state in words (sheet 41). */
  badgeStatus: BadgeStatus | null;
  /** A line of its own between two rules: `Your travel details are saved` for a request waiting on the phone (28). */
  note?: string | null;
  /** `Round trip`, `One way`; null when the server did not say. */
  trip: string | null;
  /** `1 adult`, `2 adults · 1 child`. */
  travelers: string | null;
  /** What a screen reader says, in words; the printed lines, joined, when none is given. */
  accessibilityLabel?: string;
  onPress: () => void;
  testID: string;
};

/**
 * 09, measured (card top T; the four cards averaged where they differ): the card radius 12 with the card shadow; the
 * photograph 134.6 pt wide, 7.4 pt in, 4.7 pt from the top and 6 from the bottom, radius 8.5; the words 16.3 pt right of
 * it. Baselines: the city T+36.6, the route +61.4, the days +83.1; the rule at +98.3 (to 24.4 pt from the right); the
 * facts +121.4; the card ends 19.5 pt under them (140.9 tall, 9.5 apart). The badge's top at T+16.5, 10.1 pt from the
 * right; the 24-pt chevron centred at T+73.5, its ink 11.8 pt in. The facts' marks sit where the image draws their ink:
 * the calendar 0.9 pt into the column, the words 5.4 pt after its box; the person 28.1 pt after the trip's words, the
 * words 2.7 pt after its box. A request still on the phone (28) adds its saved line between two rules: baseline 16.8
 * under the first, the second 10.4 under that, the facts 19.6 under the second.
 */
const CARD = { radius: 12, photoW: 134.6, photoLeft: 7.4, photoTop: 4.7, photoBottom: 6, photoRadius: 8.5 } as const;
const TEXT_LEFT = 16.3;
const BADGE = { top: 16.5, right: 10.1 } as const;
const CITY = 36.6;
const ROUTE = 61.4;
const DATES = 83.1;
const RULE = 98.3;
const FACTS_AFTER_RULE = 23.1;
const BOTTOM_AFTER_FACTS = 19.5;
const NOTE = { afterRule: 16.8, ruleAfter: 10.4, factsAfterRule: 19.6 } as const;
const RULE_RIGHT = 24.4;
const CHEVRON = { size: 24, centre: 73.5, right: 3.4 } as const;
const FACT = { icon: 16 } as const;
/**
 * Each fact's mark: how far its ink starts inside its 16-pt box, and where the words start after the box. The first
 * mark's ink is 0.9 pt into the column; a later one's 28.1 pt after the words before it (their last glyph's own side
 * bearing, ≈0.3, included).
 */
const MARK: Record<"calendar" | "user" | "file-text", { inset: number; after: number }> = {
  calendar: { inset: 1.47, after: 5.4 },
  user: { inset: 2.8, after: 2.7 },
  "file-text": { inset: 2.13, after: 5.33 },
};
const FIRST_INK = 0.9;
const AFTER_WORDS = 27.8;

export function RequestCard({
  photo,
  fallback,
  cachePolicy = "disk",
  city,
  route,
  dates,
  badgeStatus,
  note = null,
  trip,
  travelers,
  accessibilityLabel,
  onPress,
  testID,
}: Props) {
  const spoken =
    accessibilityLabel ??
    [city, badgeStatus ? statusCopy(badgeStatus) : null, route, dates, note, trip, travelers]
      .filter(Boolean)
      .join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={photo} fallback={fallback} cachePolicy={cachePolicy} style={styles.photo} />
      <View style={styles.body}>
        {/* The badge at the right of the city; a long city, or larger text, sends it to the next line. */}
        <View style={styles.top}>
          <Text style={styles.city} numberOfLines={2}>
            {city}
          </Text>
          {badgeStatus ? (
            // The row is as tall as the city's line: the badge may reach past it without moving what follows.
            <View style={styles.badge}>
              <StatusBadge status={badgeStatus} />
            </View>
          ) : null}
        </View>
        <Text style={styles.route}>{route}</Text>
        {dates ? <Text style={styles.dates}>{dates}</Text> : null}
        <View
          style={[
            styles.rule,
            { marginTop: RULE - (dates ? DATES : ROUTE) - belowBaseline(dates ? datesType : routeType) },
          ]}
        />
        {note ? (
          <>
            <View style={[styles.factRow, styles.noteRow]}>
              <Fact icon="file-text" text={note} first />
            </View>
            <View style={[styles.rule, styles.noteRule]} />
          </>
        ) : null}
        {trip || travelers ? (
          <View style={[styles.facts, { marginTop: (note ? NOTE.factsAfterRule : FACTS_AFTER_RULE) - factTop - HAIR }]}>
            {trip ? <Fact icon="calendar" text={trip} first /> : null}
            {travelers ? <Fact icon="user" text={travelers} first={!trip} /> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.chevron} pointerEvents="none">
        <Icon name="chevron" size={CHEVRON.size} color={tokens.colors.textSecondary} strokeWidth={1.2} />
      </View>
    </Pressable>
  );
}

function Fact({ icon, text, first = false }: { icon: keyof typeof MARK; text: string; first?: boolean }) {
  const mark = MARK[icon];
  return (
    <View style={[styles.factRow, { marginLeft: (first ? FIRST_INK : AFTER_WORDS) - mark.inset }]}>
      <Icon name={icon as IconName} size={FACT.icon} color={tokens.colors.textSecondary} strokeWidth={1.6} />
      <Text style={[styles.factText, { marginLeft: mark.after }]}>{text}</Text>
    </View>
  );
}

/** 09's words, fitted to the image (ADR-IMPL-056): the city, the route, the days (tabular figures), the facts. */
const cityType = tokens.type.requestCity;
const routeType = tokens.type.requestRoute;
const datesType = tokens.type.requestDates;
const factType = tokens.type.fact;
/** The facts row's box is the 16-pt icon; the words' baseline sits 3.7 pt under the icon's centre. */
const factTop = FACT.icon / 2 + 3.7;
/** A rule's own thickness, which the next line's distance from it already counts. */
const HAIR = StyleSheet.hairlineWidth;
/** The city's line box ends this far under the card's top; the badge's box is cut to it. */
const CITY_BOX = CITY - baselineOffset(cityType) + cityType.lineHeight;

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: CARD.radius,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.85 },
  photo: {
    width: CARD.photoW,
    marginLeft: CARD.photoLeft,
    marginTop: CARD.photoTop,
    marginBottom: CARD.photoBottom,
    borderRadius: CARD.photoRadius,
  },
  body: { flex: 1, marginLeft: TEXT_LEFT, paddingBottom: BOTTOM_AFTER_FACTS - (FACT.icon - factTop) },
  top: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: tokens.space.xs,
    rowGap: tokens.space.xxs,
  },
  city: {
    ...rn(cityType),
    color: tokens.colors.textPrimary,
    flexShrink: 1,
    marginTop: CITY - baselineOffset(cityType),
    marginLeft: -0.5,
  },
  badge: { marginTop: BADGE.top, marginRight: BADGE.right, height: CITY_BOX - BADGE.top },
  grow: { flex: 1 },
  route: {
    ...rn(routeType),
    color: tokens.colors.textPrimary,
    marginTop: ROUTE - CITY - belowBaseline(cityType) - baselineOffset(routeType),
  },
  dates: {
    ...rn(datesType),
    color: tokens.colors.textSecondary,
    marginTop: DATES - ROUTE - belowBaseline(routeType) - baselineOffset(datesType),
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.borderDefault,
    marginRight: RULE_RIGHT,
    marginLeft: -0.6,
  },
  noteRow: { marginTop: NOTE.afterRule - factTop - HAIR },
  noteRule: { marginTop: NOTE.ruleAfter - (FACT.icon - factTop) },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: tokens.space.xxs },
  factRow: { flexDirection: "row", alignItems: "flex-start" },
  // The words' baseline 3.7 pt under the mark's centre.
  factText: { ...rn(factType), color: tokens.colors.textSecondary, marginTop: factTop - baselineOffset(factType) },
  chevron: {
    position: "absolute",
    right: CHEVRON.right,
    top: CHEVRON.centre - CHEVRON.size / 2,
  },
});
