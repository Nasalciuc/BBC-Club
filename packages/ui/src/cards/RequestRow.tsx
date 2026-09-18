import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../primitives/Button";
import { StatusBadge } from "../primitives/StatusBadge";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  route: string;
  meta: string;
  /** StatusBadge key — already mapped (quote_ready, not_sent, …). */
  badgeStatus: string;
  muted?: boolean;
  onPress: () => void;
  onCall?: () => void;
  onRetry?: () => void;
  testID: string;
  callTestID?: string;
  retryTestID?: string;
};

/** Request list row. Copy is a prop — no English hardcoded for route/meta. */
export function RequestRow({
  route,
  meta,
  badgeStatus,
  muted = false,
  onPress,
  onCall,
  onRetry,
  testID,
  callTestID,
  retryTestID,
}: Props) {
  const notSent = badgeStatus === "not_sent";
  const quoteReady = badgeStatus === "quote_ready";

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${route}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, notSent && styles.warn, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <Text style={[styles.route, muted && styles.muted]} numberOfLines={1}>
          {route}
        </Text>
        <StatusBadge status={badgeStatus} />
      </View>
      <Text style={[styles.meta, muted && styles.muted]} numberOfLines={2}>
        {meta}
      </Text>
      {quoteReady && onCall ? (
        <Button
          testID={callTestID ?? `${testID}.call`}
          label="Call your specialist"
          onPress={onCall}
          shape="card"
          variant="primary"
          style={styles.call}
        />
      ) : null}
      {notSent && onRetry ? (
        <Pressable
          testID={retryTestID ?? `${testID}.retry`}
          accessibilityRole="button"
          accessibilityLabel="Tap to send"
          onPress={onRetry}
          hitSlop={8}
        >
          <Text style={styles.retry}>Tap to send</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** Dial helper for screens — kept here so gallery can pass onCall without Linking. */
export function dialSupport(phone: string): void {
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: tokens.space.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
    gap: tokens.space.xs,
  },
  warn: {
    borderWidth: 1,
    borderColor: tokens.colors.statusDanger,
    borderRadius: tokens.radius.card,
    paddingHorizontal: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  pressed: { opacity: 0.9 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  route: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flex: 1 },
  meta: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  muted: { color: tokens.colors.textSecondary },
  call: { marginTop: tokens.space.xs, minHeight: 44 },
  retry: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger },
});
