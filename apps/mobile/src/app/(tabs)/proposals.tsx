import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProposalCardVM } from "@bbc/shared/api/v1/proposals";

import { ProposalCard } from "@/components/proposal-card";
import { Club } from "@/constants/club";
import { fetchFeed } from "@/lib/api";

export default function ProposalsFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ProposalCardVM[]>([]);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(opts?: { refresh?: boolean; keepEtag?: boolean }) {
    if (opts?.refresh) setRefreshing(true);
    else if (!opts?.keepEtag) setLoading(true);
    setError(null);
    const result = await fetchFeed(opts?.refresh ? null : etag);
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!result.data.notModified) {
      setItems(result.data.feed.items);
      setEtag(result.data.etag);
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <View testID="feed.root" style={[styles.root, { paddingTop: insets.top + Club.space.md }]}>
      <Text style={styles.kicker}>YOUR OFFERS</Text>
      <Text style={styles.title}>Proposals</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Club.colors.primary} testID="feed.loading" />
        </View>
      ) : error ? (
        <View style={styles.centered} testID="feed.error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable testID="feed.retry" accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="feed.list"
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ refresh: true })}
              tintColor={Club.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered} testID="feed.empty">
              <Text style={styles.emptyTitle}>Nothing curated yet</Text>
              <Text style={styles.emptyBody}>When Julia has something for you, it will appear here.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <ProposalCard
              card={item}
              testID={index === 0 ? "feed.card" : `feed.card.${item.id}`}
              onPress={() => router.push({ pathname: "/proposal/[id]", params: { id: item.id } })}
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
    marginBottom: Club.space.lg,
  },
  list: {
    paddingBottom: Club.space.xxl,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Club.space.lg,
    gap: Club.space.sm,
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
    marginTop: Club.space.sm,
  },
});
