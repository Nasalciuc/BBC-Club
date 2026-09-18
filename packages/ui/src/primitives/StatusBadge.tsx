import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

const COPY = {
  received: "RECEIVED",
  quote_ready: "QUOTE READY",
  booked: "BOOKED",
  not_sent: "NOT SENT",
} as const;

type Status = keyof typeof COPY;

/** `quoted` (API) maps to quote_ready (UI). Unknown statuses render as received and warn. */
export function StatusBadge({ status }: { status: string }) {
  const normalized = status === "quoted" ? "quote_ready" : status;
  const known = (normalized in COPY ? normalized : "received") as Status;
  if (!(normalized in COPY)) console.warn(`[StatusBadge] unknown status "${status}"`);

  return (
    <View
      style={[styles.badge, known === "quote_ready" && styles.hot, known === "not_sent" && styles.warn]}
      accessibilityLabel={COPY[known].toLowerCase()}
    >
      <Text style={[styles.text, known === "quote_ready" && styles.hotText, known === "not_sent" && styles.warnText]}>
        {COPY[known]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.badge,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xxs / 2,
  },
  hot: { backgroundColor: tokens.colors.primary },
  warn: { backgroundColor: "transparent", borderWidth: 1, borderColor: tokens.colors.statusDanger },
  text: { ...rn(tokens.type.labelMono), color: tokens.colors.textPrimary },
  hotText: { color: tokens.colors.textOnDark },
  warnText: { color: tokens.colors.statusDanger },
});
