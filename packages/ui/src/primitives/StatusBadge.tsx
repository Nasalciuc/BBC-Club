import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { STATUS_COPY, badgeOf, type BadgeStatus } from "./status-copy";

export { statusCopy, type BadgeStatus } from "./status-copy";

type Props = {
  /** A badge's state; the API's `quoted` is accepted as Quote ready. */
  status: BadgeStatus | "quoted";
  /** 25 pt in a card (09); `title`: 26.7 pt with 12.5-pt words beside a request's title (32, 33); `sm` 23. */
  size?: "md" | "sm" | "title";
};

/**
 * The status badges, measured on 09 (sheet 41): `Quote ready` filled navy with white Semibold words; `Received` light
 * blue; `Booked` white on a navy hairline with a 15-pt navy check; `Closed` light grey with slate words; `Not sent`
 * white on a light navy outline (28, 32). 11.7-pt words, 12.5 pt either side, fully round.
 */
export function StatusBadge({ status, size = "md" }: Props) {
  const { badge, known } = badgeOf(status);
  if (!known) console.warn(`[StatusBadge] unknown status "${status}"`);
  return (
    <View style={[styles.badge, styles[size], TONE[badge]]}>
      {badge === "booked" ? (
        <View style={styles.check}>
          <Icon name="check" size={10} color={tokens.colors.textOnPhoto} strokeWidth={3.2} />
        </View>
      ) : null}
      <Text style={[styles.text, size === "title" && styles.titleText, WORDS[badge]]} numberOfLines={1}>
        {STATUS_COPY[badge]}
      </Text>
    </View>
  );
}

/** 09: Booked's check, a 15.2-pt navy circle 11 pt in, 5.7 pt before its word. */
const CHECK = { size: 15.2, padLeft: 11, gap: 5.7 } as const;

const TONE: Record<BadgeStatus, ViewStyle> = {
  quote_ready: { backgroundColor: tokens.colors.primary },
  received: { backgroundColor: tokens.colors.surfaceTintBlue },
  booked: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 0.9,
    borderColor: tokens.colors.primary,
    paddingLeft: CHECK.padLeft,
  },
  closed: { backgroundColor: tokens.colors.surfaceClosed },
  not_sent: { backgroundColor: tokens.colors.surfaceCard, borderWidth: 0.9, borderColor: tokens.colors.borderStrong },
};

const WORDS: Record<BadgeStatus, TextStyle> = {
  quote_ready: { ...rn(tokens.type.badgeStrong), color: tokens.colors.textOnPhoto },
  received: { color: tokens.colors.textPrimary },
  booked: { color: tokens.colors.textPrimary },
  closed: { color: tokens.colors.textOnClosed },
  not_sent: { color: tokens.colors.textPrimary },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: CHECK.gap,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12.5,
  },
  md: { minHeight: 25 },
  sm: { minHeight: 23 },
  title: { minHeight: 26.7 },
  check: {
    width: CHECK.size,
    height: CHECK.size,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { ...rn(tokens.type.badge) },
  titleText: { ...rn(tokens.type.badgeTitle) },
});
