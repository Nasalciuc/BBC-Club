import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { EmptyState, RequestRow, SectionLabel, tokens, rn } from "@bbc/ui";

import { badgeStatus, isOpen, requestMeta } from "@/features/requests/status";
import { fetchRequests, submitRequest } from "@/lib/api";
import { flushQueue, listQueued } from "@/lib/queue";

const SUPPORT = "+18000000000";

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RequestVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await flushQueue((body, key) => submitRequest(body, key));
      } catch {
        // flushQueue isolates per item; this keeps fetchRequests running
      }
      const result = await fetchRequests();
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.data.items);
      setError(null);
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setError("Something went wrong.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        setReloadToken((n) => n + 1);
      }
    });
    return () => sub();
  }, []);

  const open = items.filter((r) => isOpen(r.status));
  const closed = items.filter((r) => !isOpen(r.status));

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View testID="requests.root" style={[styles.root, { paddingTop: insets.top + tokens.space.md }]}>
      <Text style={styles.title}>Requests</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <EmptyState
          testID="requests.empty"
          title="No requests yet."
          body="Search a route or pick an offer to get started."
          primary={{
            label: "Search",
            onPress: () => router.push("/(tabs)/explore" as Href),
          }}
        />
      ) : (
        <FlatList
          data={[{ key: "open" }, { key: "closed" }]}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingBottom: tokens.space.xxl }}
          renderItem={({ item }) => {
            if (item.key === "open") {
              return (
                <View>
                  <SectionLabel label="Open" />
                  {open.map((r) => (
                    <RequestRow
                      key={r.id}
                      testID={`requests.row.${r.id}`}
                      callTestID={`requests.call.${r.id}`}
                      retryTestID={`requests.retry.${r.id}`}
                      route={r.route}
                      meta={requestMeta(r)}
                      badgeStatus={badgeStatus(r.status)}
                      onPress={() => undefined}
                      onCall={r.status === "quoted" ? () => void Linking.openURL(`tel:${SUPPORT}`) : undefined}
                      onRetry={
                        r.status === "not_sent"
                          ? () => {
                              void (async () => {
                                void listQueued();
                                try {
                                  await flushQueue((body, key) => submitRequest(body, key));
                                } catch {
                                  // per-item isolation lives in flushQueue
                                }
                                setReloadToken((n) => n + 1);
                              })().catch(() => {
                                setReloadToken((n) => n + 1);
                              });
                            }
                          : undefined
                      }
                    />
                  ))}
                </View>
              );
            }
            return (
              <View>
                <SectionLabel label="Closed" />
                {closed.map((r) => (
                  <RequestRow
                    key={r.id}
                    testID={`requests.row.${r.id}`}
                    route={r.route}
                    meta={requestMeta(r)}
                    badgeStatus={badgeStatus(r.status)}
                    muted
                    onPress={() => undefined}
                  />
                ))}
              </View>
            );
          }}
        />
      )}
      <View testID="requests.empty.search" style={{ height: 0, width: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage, paddingHorizontal: tokens.space.lg },
  centered: { alignItems: "center", justifyContent: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, marginBottom: tokens.space.sm },
  error: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDanger },
});
