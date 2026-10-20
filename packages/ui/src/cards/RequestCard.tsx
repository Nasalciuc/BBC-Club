import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { Photo, type PhotoSource } from "../primitives/Photo";
import { StatusBadge, statusCopy, type BadgeStatus } from "../primitives/StatusBadge";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The destination's photograph (ADR-IMPL-043); null — the fallback. */
  photo: PhotoSource | null;
  fallback: PhotoSource | null;
  /** `memory` for a satellite view (its terms ask that it not be kept). */
  cachePolicy?: "memory" | "disk";
  /** The destination's city (`London`); the route stands in when the city is unknown. */
  city: string;
  /** `JFK → LHR`. */
  route: string;
  /** `Nov 12 – 19`; null when the request names no day. */
  dates: string | null;
  /** The request's state in words (sheet 41). */
  badgeStatus: BadgeStatus | null;
  /** A line of its own between two rules: `Your travel details are saved` for a request waiting on the phone (28). */
  note?: string | null;
  /** `Round trip`, `One way`; null when the server did not say. */
  trip: string | null;
  /** `1 adult`, `2 adults · 1 child`. */
  travelers: string | null;
  /** What a screen reader says, in words (`London, quote ready, JFK to LHR, November 12 to 19, round trip, 1 adult`);
   *  the printed lines, joined, when none is given. */
  accessibilityLabel?: string;
  onPress: () => void;
  testID: string;
};

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={20} color={tokens.colors.textSecondary} strokeWidth={1.75} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

/**
 * A request on Requests (09, 28; sheet 40 · 09): the destination's photograph at the left; the city with its state at
 * the right, the route and the days over a rule, then the trip and the travelers, each with its icon. A request
 * waiting on the phone says its details are saved on a line of its own. The whole card opens the request — the
 * chevron says so; its calls and retries live there.
 */
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
          {badgeStatus ? <StatusBadge status={badgeStatus} /> : null}
        </View>
        <View style={styles.middle}>
          <View style={styles.grow}>
            <Text style={styles.route}>{route}</Text>
            {dates ? <Text style={styles.dates}>{dates}</Text> : null}
          </View>
          <Icon name="chevron" size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
        </View>
        <View style={styles.rule} />
        {note ? (
          <>
            <View style={styles.fact}>
              <Icon name="file-text" size={20} color={tokens.colors.textSecondary} strokeWidth={1.75} />
              <Text style={[styles.factText, styles.grow]}>{note}</Text>
            </View>
            <View style={styles.rule} />
          </>
        ) : null}
        {trip || travelers ? (
          <View style={styles.facts}>
            {trip ? <Fact icon="calendar" text={trip} /> : null}
            {travelers ? <Fact icon="user" text={travelers} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: tokens.space.md,
    padding: tokens.space.xs,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  pressed: { opacity: 0.85 },
  // 09: the photograph a third of the card, as tall as the card's words; its corners follow the card's.
  photo: { width: 128, minHeight: 124, borderRadius: tokens.radius.sm },
  body: { flex: 1, gap: tokens.space.xs, paddingVertical: tokens.space.xs, paddingRight: tokens.space.xxs },
  top: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.space.xs,
    rowGap: tokens.space.xxs,
  },
  city: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary, flexShrink: 1 },
  middle: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
  grow: { flex: 1 },
  route: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  dates: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: tokens.colors.borderDefault },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: tokens.space.md, rowGap: tokens.space.xxs },
  fact: { flexDirection: "row", alignItems: "center", gap: 6 },
  factText: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
});
