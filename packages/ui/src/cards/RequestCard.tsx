import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBadge, statusCopy, type BadgeStatus } from "../primitives/StatusBadge";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The destination's city (`London`); the route stands in when the city is unknown. */
  title: string;
  /** `JFK → LHR · BUSINESS` */
  facts: string;
  /** `OCT 12–19 · 1 ADULT`, or `Your travel details are saved` for a request not sent yet (Figma 240:5199). */
  when: string;
  /** The badge, already mapped (quote_ready, not_sent, …). Null hides it (closed). */
  badgeStatus: BadgeStatus | null;
  /** What a screen reader says, in words (`London, quote ready, JFK to LHR, business, October 12 to 19, 1 adult`); the
   *  printed lines, joined, when none is given. */
  accessibilityLabel?: string;
  /** Figma 436:1169: Full on Requests (the city at 28 pt), Compact on Profile (20 pt). */
  size?: "full" | "compact";
  onPress: () => void;
  testID: string;
};

/**
 * Figma `Proposal / RequestCard` (436:1169): the city and its status, then two mono fact lines. No photograph, no button,
 * no chevron — the whole card opens the request, where the actions live. Copy is a prop.
 */
export function RequestCard({
  title,
  facts,
  when,
  badgeStatus,
  accessibilityLabel,
  size = "full",
  onPress,
  testID,
}: Props) {
  const compact = size === "compact";
  const spoken =
    accessibilityLabel ?? [title, badgeStatus ? statusCopy(badgeStatus) : null, facts, when].filter(Boolean).join(", ");

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.card, compact ? styles.compact : styles.full, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <Text style={[styles.city, compact && styles.cityCompact]} numberOfLines={2}>
          {title}
        </Text>
        {badgeStatus ? <StatusBadge status={badgeStatus} /> : null}
      </View>
      <Text style={styles.facts}>{facts}</Text>
      <Text style={styles.facts}>{when}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  full: { padding: tokens.space.md, gap: tokens.space.xs },
  compact: { paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, gap: tokens.space.xxs },
  pressed: { transform: [{ scale: 0.98 }] },
  // The badge follows the city's column (176 of the card's 313 pt), as the frame draws it — not pinned to the edge. A
  // longer city, or larger text, widens the column; the badge then moves to the next line rather than a word breaking.
  // Centred on the city's line, as Figma's `City and status` row is, at every text size.
  top: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.space.xs },
  city: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, minWidth: 176, maxWidth: "100%" },
  cityCompact: { ...rn(tokens.type.title) },
  facts: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
});
