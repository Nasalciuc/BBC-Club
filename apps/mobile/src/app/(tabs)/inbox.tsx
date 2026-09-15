import { useFocusEffect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InboxItemVM } from "@bbc/shared/api/v1/proposals";

import { InboxRow } from "@/components/inbox-row";
import { Club } from "@/constants/club";
import { fetchInbox, markInboxRead } from "@/lib/api";

export default function InboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InboxItemVM[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const result = await fetchInbox();
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setItems(result.data.items);
    setUnreadCount(result.data.unreadCount);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(() => {
    void load();
  });

  async function onOpen(item: InboxItemVM) {
    if (!item.read) {
      await markInboxRead(item.id);
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      setUnreadCount((n) => Math.max(0, n - 1));
    }
    if (item.offerId) {
      router.push({ pathname: "/proposal/[id]", params: { id: item.offerId } });
    }
  }

  return (
    <View testID="inbox.root" style={[styles.root, { paddingTop: insets.top + Club.space.md }]}>
      <Text style={styles.kicker}>MESSAGES</Text>
      <Text style={styles.title}>Inbox</Text>
      {unreadCount > 0 ? (
        <Text testID="inbox.unread" style={styles.unread}>
          {unreadCount} unread
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Club.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered} testID="inbox.error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable testID="inbox.retry" accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="inbox.list"
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Club.colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centered} testID="inbox.empty">
              <Text style={styles.emptyTitle}>All quiet</Text>
              <Text style={styles.emptyBody}>Advisor notes and offer notices will land here.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <InboxRow
              item={item}
              testID={index === 0 ? "inbox.row" : `inbox.row.${item.id}`}
              onPress={() => void onOpen(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePage,
    paddingHorizontal: Club.space.gutter,
  },
  kicker: {
    ...Club.type.labelMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: Club.space.xs,
  },
  title: {
    ...Club.type.display,
    color: Club.colors.textPrimary,
    marginBottom: Club.space.sm,
  },
  unread: {
    ...Club.type.caption,
    color: Club.colors.textSecondary,
    marginBottom: Club.space.md,
  },
  list: {
    paddingBottom: Club.space.xxl,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Club.space.sm,
    paddingHorizontal: Club.space.lg,
  },
  emptyTitle: {
    ...Club.type.title,
    color: Club.colors.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
    textAlign: "center",
  },
  errorText: {
    ...Club.type.bodySm,
    color: Club.colors.textSecondary,
    textAlign: "center",
  },
  retry: {
    ...Club.type.button,
    color: Club.colors.primary,
  },
});
