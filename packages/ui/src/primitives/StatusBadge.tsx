import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { STATUS_COPY, badgeOf, type BadgeStatus } from "./status-copy";

export { statusCopy, type BadgeStatus } from "./status-copy";

type Props = {
  /** A badge's state; the API's `quoted` is accepted as Quote ready. */
  status: BadgeStatus | "quoted";
  /** 32 pt in a card (09), 28 beside a request's title (32, 33). */
  size?: "md" | "sm";
};

/**
 * The status badges of sheet 41, each named in words: `Quote ready` filled navy; `Received` light navy; `Booked` a navy
 * outline with a check; `Closed` light tint; `Not sent` a light navy outline. Navy words on all but Quote ready. The
 * parent places it.
 */
export function StatusBadge({ status, size = "md" }: Props) {
  const { badge, known } = badgeOf(status);
  if (!known) console.warn(`[StatusBadge] unknown status "${status}"`);
  const filled = badge === "quote_ready";
  return (
    <View style={[styles.badge, size === "sm" ? styles.sm : styles.md, TONE[badge]]}>
      {badge === "booked" ? (
        <View style={styles.check}>
          <Icon name="check" size={12} color={tokens.colors.textOnPhoto} strokeWidth={3} />
        </View>
      ) : null}
      <Text style={[styles.text, filled && styles.filledText]} numberOfLines={1}>
        {STATUS_COPY[badge]}
      </Text>
    </View>
  );
}

const TONE: Record<BadgeStatus, ViewStyle> = {
  quote_ready: { backgroundColor: tokens.colors.actionPrimary },
  received: { backgroundColor: tokens.colors.borderDefault },
  booked: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1.5, borderColor: tokens.colors.primary },
  closed: { backgroundColor: tokens.colors.surfaceTint },
  not_sent: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 1.5, borderColor: tokens.colors.borderDefault },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: tokens.space.xs - 2,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.sm,
  },
  md: { minHeight: 32 },
  sm: { minHeight: 28 },
  check: {
    width: 18,
    height: 18,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.actionPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
  filledText: { color: tokens.colors.textOnPhoto },
});
