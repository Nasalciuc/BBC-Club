import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { STATUS_COPY, badgeOf, type BadgeStatus } from "./status-copy";

export { statusCopy, type BadgeStatus } from "./status-copy";

type Props = {
  /** A badge's state; the API's `quoted` is accepted as Quote ready. */
  status: BadgeStatus | "quoted";
  /** Figma 26:20 is 32 pt high in a card; under a request's title (233:4198) it is 24 pt. */
  size?: "md" | "sm";
};

/**
 * Figma 26:20: the state named in words, sentence case. Only Quote ready is filled; Received, Booked and Not sent are a
 * hairline frame on `surface-card` — no semantic colour, no urgency. The fill keeps the words at 4.76:1 on the porcelain
 * page as on a card (DESIGN.md: 4.5:1); Figma draws the frame transparent (ADR-IMPL-041, A2c). The parent places it.
 */
export function StatusBadge({ status, size = "md" }: Props) {
  const { badge, known } = badgeOf(status);
  if (!known) console.warn(`[StatusBadge] unknown status "${status}"`);
  const filled = badge === "quote_ready";

  return (
    <View style={[styles.badge, size === "sm" ? styles.sm : styles.md, filled ? styles.filled : styles.framed]}>
      <Text style={[styles.text, filled && styles.filledText]} numberOfLines={1}>
        {STATUS_COPY[badge]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    justifyContent: "center",
    borderRadius: tokens.radius.badge,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xxs,
  },
  md: { minHeight: 32 },
  sm: { minHeight: 24, paddingVertical: 0 },
  filled: { backgroundColor: tokens.colors.actionPrimary },
  framed: { borderWidth: 1, borderColor: tokens.colors.borderDefault, backgroundColor: tokens.colors.surfaceCard },
  text: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  filledText: { color: tokens.colors.textOnDark },
});
