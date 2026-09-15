import { Pressable, StyleSheet, Text, View } from "react-native";
import type { InboxItemVM } from "@bbc/shared/api/v1/proposals";

import { Club } from "@/constants/club";
import { formatInboxDate } from "@/lib/format";

type Props = {
  item: InboxItemVM;
  onPress: () => void;
  testID?: string;
};

export function InboxRow({ item, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.markerSlot}>{!item.read ? <View style={styles.dot} /> : null}</View>
      <View style={styles.content}>
        <Text style={[styles.title, item.read ? styles.read : styles.unread]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.date}>{formatInboxDate(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Club.space.md,
    borderBottomWidth: 1,
    borderBottomColor: Club.colors.borderDefault,
    minHeight: 64,
  },
  pressed: {
    opacity: 0.85,
  },
  markerSlot: {
    width: 16,
    paddingTop: 8,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Club.colors.primary,
  },
  content: {
    flex: 1,
    gap: Club.space.xxs,
  },
  title: {
    ...Club.type.body,
    color: Club.colors.textPrimary,
  },
  unread: {
    fontFamily: "Inter_500Medium",
  },
  read: {
    color: Club.colors.textSecondary,
  },
  date: {
    ...Club.type.caption,
    color: Club.colors.textTertiary,
  },
});
